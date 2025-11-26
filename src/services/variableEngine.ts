
import _ from 'lodash';

/**
 * VARIABLE ENGINE - HYBRID LODASH SANDBOX
 * 
 * Tiêu chuẩn cao nhất:
 * 1. Native Execution: Sử dụng `new Function` để chạy mã JS thật.
 * 2. Hybrid Library: Kết hợp sức mạnh của Lodash thật với logic tùy chỉnh của SillyTavern.
 * 3. Tuple-Awareness: Tự động xử lý cấu trúc [Value, Description] đặc trưng của ST.
 * 4. Safety: Chạy trong hộp cát, chặn truy cập window/document.
 */

// --- 1. HELPER UTILS & CLEANING ---

/**
 * Làm sạch chuỗi thô từ AI trước khi xử lý.
 * Loại bỏ các thẻ XML bao quanh và lọc bỏ các dòng không phải code JS.
 */
const extractScriptContent = (rawText: string): { script: string, cleanText: string } => {
    // 1. Tìm khối <UpdateVariable> bao quanh (Case insensitive)
    const updateBlockRegex = /<UpdateVariable(?:variable)?>([\s\S]*?)<\/UpdateVariable(?:variable)?>/i;
    const match = rawText.match(updateBlockRegex);

    if (!match || !match[1]) {
        return { script: "", cleanText: rawText };
    }

    let rawContent = match[1];

    // 2. Xóa bỏ khối <Analysis>...</Analysis> và các thẻ XML phổ biến khác của AI
    // Sử dụng regex thay thế mạnh tay để đảm bảo sạch sẽ
    rawContent = rawContent
        .replace(/<Analysis>[\s\S]*?<\/Analysis>/gi, "")
        .replace(/<Thinking>[\s\S]*?<\/Thinking>/gi, "")
        .trim();

    // 3. Vệ sinh từng dòng (Line-by-line Sanitization)
    const lines = rawContent.split('\n');
    const validLines = lines.filter(line => {
        const trimmed = line.trim();
        // Bỏ qua dòng trống
        if (!trimmed) return false;
        // Bỏ qua dòng bắt đầu bằng thẻ XML (ví dụ <comment>, </tag>)
        if (trimmed.startsWith('<')) return false;
        // Bỏ qua dòng bắt đầu bằng markdown code fence
        if (trimmed.startsWith('```')) return false;
        // Bỏ qua các dòng label kiểu "Analysis:" mà AI hay viết thừa
        if (/^[A-Za-z0-9_]+:\s*$/i.test(trimmed)) return false; 
        
        return true;
    });

    let script = validLines.join('\n').trim();
    
    // 4. Giải mã ký tự HTML entity (nếu AI trả về &gt; thay vì >)
    script = script
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&')
        .replace(/[\u2018\u2019]/g, "'") // Smart quotes
        .replace(/[\u201C\u201D]/g, '"');

    // Loại bỏ khối lệnh khỏi văn bản hiển thị
    const cleanText = rawText.replace(updateBlockRegex, "").trim();

    return { script, cleanText };
};

/**
 * Deep Get: Lấy giá trị từ object theo đường dẫn 'a.b[0]'.
 * Tự động trả về giá trị gốc nếu biến là Tuple [Value, Description].
 */
export const get = (obj: any, path: string, defaultValue: any = undefined): any => {
    if (!obj || !path) return defaultValue;
    
    // Chuẩn hóa đường dẫn: a['b'][0] -> a.b.0
    const normalizedPath = path
        .replace(/^stat_data\./, '')
        .replace(/^variables\./, '')
        .replace(/\["([^"]+)"\]/g, '.$1')
        .replace(/\['([^']+)'\]/g, '.$1')
        .replace(/\[(\d+)\]/g, '.$1');
        
    const val = _.get(obj, normalizedPath);
    
    // ST Logic: Nếu kết quả là [val, string], trả về val (Tuple unwrapping)
    // Nhưng nếu người dùng muốn lấy chính cái mảng đó (ví dụ để push), thì logic này có thể gây cản trở.
    // Tuy nhiên, trong get() thông thường để hiển thị/tính toán, unwrap là đúng.
    // Các hàm push/assign sẽ tự xử lý việc lấy raw object.
    if (Array.isArray(val) && val.length === 2 && typeof val[1] === 'string') {
        return val[0];
    }
    
    return val === undefined ? defaultValue : val;
};

/**
 * Deep Set: Gán giá trị vào object. 
 * Thông minh: Nếu đích là Tuple [Value, Desc], chỉ cập nhật Value.
 */
const set = (obj: any, path: string, value: any): void => {
    const normalizedPath = path
        .replace(/^stat_data\./, '')
        .replace(/^variables\./, '')
        .replace(/\["([^"]+)"\]/g, '.$1')
        .replace(/\['([^']+)'\]/g, '.$1')
        .replace(/\[(\d+)\]/g, '.$1');

    // Lấy giá trị hiện tại để kiểm tra xem có phải Tuple không
    const currentVal = _.get(obj, normalizedPath);

    // Tuple Check: Nếu biến hiện tại là mảng [val, desc], chỉ cập nhật val
    if (Array.isArray(currentVal) && currentVal.length === 2 && typeof currentVal[1] === 'string') {
        // Target is a tuple, update index 0, keep index 1 (desc)
        const newTuple = [value, currentVal[1]];
        _.set(obj, normalizedPath, newTuple);
    } else {
        // Standard set
        _.set(obj, normalizedPath, value);
    }
};

/**
 * Math Ops Helper
 */
const mathOp = (obj: any, path: string, val: any, op: 'add' | 'sub' | 'mul' | 'div' | 'mod') => {
    const currentVal = Number(get(obj, path)) || 0;
    const operand = Number(val);
    if (isNaN(operand)) return;

    let result = currentVal;
    switch (op) {
        case 'add': result += operand; break;
        case 'sub': result -= operand; break;
        case 'mul': result *= operand; break;
        case 'div': result = operand !== 0 ? result / operand : result; break;
        case 'mod': result = operand !== 0 ? result % operand : result; break;
    }
    set(obj, path, result);
};

// --- 2. THE HYBRID LIBRARY (_) ---
// Kết hợp Lodash thật với các hàm tùy chỉnh của SillyTavern.

const createHybridLodash = (scopeVariables: any, logger: (msg: string) => void) => {
    // 1. Tạo đối tượng chứa các hàm Custom (ST Specific)
    const customOverrides = {
        // Basic Accessors
        get: (path: string, def?: any) => get(scopeVariables, path, def),
        
        set: (path: string, val: any, ...args: any[]) => { 
            // ST sometimes generates _.set('path', old_val, new_val). We take the LAST arg as the new value.
            // If only 2 args: set(path, val) -> val is the value.
            const actualVal = args.length > 0 ? args[args.length - 1] : val;
            set(scopeVariables, path, actualVal);
            logger(`SET ${path} = ${JSON.stringify(actualVal)}`);
        },
        
        // Math
        add: (path: string, val: any) => { mathOp(scopeVariables, path, val, 'add'); logger(`ADD ${path} + ${val}`); },
        sub: (path: string, val: any) => { mathOp(scopeVariables, path, val, 'sub'); logger(`SUB ${path} - ${val}`); },
        mul: (path: string, val: any) => { mathOp(scopeVariables, path, val, 'mul'); logger(`MUL ${path} * ${val}`); },
        div: (path: string, val: any) => { mathOp(scopeVariables, path, val, 'div'); logger(`DIV ${path} / ${val}`); },
        
        // ST-Specific Assign (Polymorphic)
        // 1. assign(arrayPath, value) -> PUSH value to array
        // 2. assign(objPath, key, value) -> SET obj[key] = value
        assign: (path: string, ...args: any[]) => {
            const normalizedPath = path
                .replace(/^stat_data\./, '')
                .replace(/^variables\./, '')
                .replace(/\["([^"]+)"\]/g, '.$1')
                .replace(/\['([^']+)'\]/g, '.$1')
                .replace(/\[(\d+)\]/g, '.$1');

            // Lấy raw value (không unwrap tuple) để kiểm tra kiểu
            let target = _.get(scopeVariables, normalizedPath);

            // Nếu target là Tuple [Array, Desc], ta cần lấy cái Array bên trong
            if (Array.isArray(target) && target.length === 2 && typeof target[1] === 'string' && Array.isArray(target[0])) {
                target = target[0]; 
                // Lưu ý: Ở đây target là tham chiếu đến mảng con trong tuple, nên thay đổi target sẽ thay đổi tuple
                // Tuy nhiên, _.get có thể trả về deep copy hoặc reference tùy implementation, 
                // nhưng trong context biến JS object thường là reference.
                // Để an toàn, ta sẽ dùng push trực tiếp vào object gốc thông qua path + '[0]'.
            }

            // Case 1: Assign Key-Value (3 args total: path, key, value)
            if (args.length >= 2) {
                const key = args[0];
                const value = args[1];
                const fullPath = `${normalizedPath}.${key}`;
                
                // Sử dụng hàm set nội bộ để xử lý an toàn
                set(scopeVariables, fullPath, value);
                logger(`ASSIGN (KEY) ${fullPath} = ${JSON.stringify(value)}`);
            } 
            // Case 2: Push to Array (2 args total: path, value)
            else if (args.length === 1) {
                const value = args[0];
                
                // Lấy lại target chính xác để push (ưu tiên mảng)
                // Ta dùng get() của mình để nó tự unwrap tuple nếu có.
                // Nếu get() trả về mảng -> push.
                const arr = get(scopeVariables, path); 
                
                if (Array.isArray(arr)) {
                    // Xử lý ST Meta Placeholder: Xóa nó đi nếu nó là phần tử duy nhất
                    if (arr.length === 1 && arr[0] === '$__META_EXTENSIBLE__$') {
                        arr.pop();
                    }
                    arr.push(value);
                    logger(`ASSIGN (PUSH) ${path} << ${JSON.stringify(value)}`);
                } else {
                    // Fallback: Nếu không phải mảng, có thể là object merge?
                    // Nhưng thường ST dùng 2 tham số cho mảng.
                    logger(`WARN: ASSIGN failed. Target at '${path}' is not an array.`);
                }
            }
        },

        // Array Ops - Standard
        push: (path: string, val: any) => {
            const arr = get(scopeVariables, path);
            if (Array.isArray(arr)) {
                arr.push(val);
                logger(`PUSH ${path} << ${JSON.stringify(val)}`);
            }
        },
        insert: (path: string, val: any) => { // Alias for push in ST prompts
             const arr = get(scopeVariables, path);
             if (Array.isArray(arr)) {
                 arr.push(val);
                 logger(`INSERT ${path} << ${JSON.stringify(val)}`);
             }
        },
        remove: (path: string, val: any) => {
            const arr = get(scopeVariables, path);
            if (Array.isArray(arr)) {
                // Remove by value match (simple or object deep match)
                const idx = arr.findIndex(item => JSON.stringify(item) === JSON.stringify(val) || item === val);
                if (idx > -1) {
                    arr.splice(idx, 1);
                    logger(`REMOVE ${path} >> ${JSON.stringify(val)}`);
                }
            }
        },

        // Logging
        log: (msg: any) => logger(`SCRIPT LOG: ${msg}`)
    };

    // 2. Merge với Lodash thật
    // Lodash thật cung cấp các hàm mạnh mẽ như shuffle, chain, map, filter...
    // Custom overrides sẽ ghi đè các hàm trùng tên (set, get, add...) của Lodash
    return Object.assign({}, _, customOverrides);
};

// --- 3. EXECUTION ENGINE ---

export const processVariableUpdates = (
    rawText: string,
    currentVariables: Record<string, any>
): { updatedVariables: Record<string, any>; cleanedText: string; variableLog: string } => {
    
    const { script, cleanText } = extractScriptContent(rawText);
    
    // Nếu không có script, trả về ngay
    if (!script) {
        return { 
            updatedVariables: currentVariables, 
            cleanedText: cleanText, 
            variableLog: '' 
        };
    }

    // Tạo bản sao sâu của variables để thao tác (Immutability)
    const workingVariables = JSON.parse(JSON.stringify(currentVariables));
    const logMessages: string[] = [];
    const logger = (msg: string) => logMessages.push(msg);

    // Tạo thư viện lai Hybrid Lodash
    const hybridLib = createHybridLodash(workingVariables, logger);

    logMessages.push('[JS ENGINE] Bắt đầu thực thi mã thẻ...');

    try {
        // --- SANDBOX CONSTRUCTION ---
        // Chúng ta tạo một hàm mới (Native Sandbox).
        // 'variables' và '_' là các tham số được truyền vào.
        // Các biến toàn cục nguy hiểm như window, document bị che khuất bởi 'undefined'.
        
        const safeRunner = new Function(
            'variables', 
            '_', 
            'stat_data', // Alias phổ biến trong thẻ V3
            'window', 'document', 'fetch', 'XMLHttpRequest', // Shadowing globals for safety
            `
            "use strict";
            try {
                ${script}
            } catch (e) {
                throw e;
            }
            `
        );

        // Thực thi!
        safeRunner(
            workingVariables, 
            hybridLib, 
            workingVariables, // stat_data alias pointing to same obj
            undefined, undefined, undefined, undefined
        );

        logMessages.push('[JS ENGINE] Thực thi thành công.');

    } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        logMessages.push(`[JS ENGINE ERROR] ${err}`);
        console.error("Script Execution Failed:", e);
        
        // Nếu lỗi, chúng ta trả về currentVariables (dữ liệu cũ) để tránh dữ liệu bị hỏng dở dang.
        return {
            updatedVariables: currentVariables,
            cleanedText: cleanText,
            variableLog: logMessages.join('\n')
        };
    }

    return {
        updatedVariables: workingVariables,
        cleanedText: cleanText,
        variableLog: logMessages.join('\n')
    };
};

// --- 4. LEGACY SUPPORT WRAPPER ---
// Giữ lại hàm này để hỗ trợ các module cũ vẫn gọi applyVariableOperation
// Nhưng bên trong sẽ chuyển hướng sang dùng logic của set/get mới.

export const applyVariableOperation = (
    currentVariables: Record<string, any>,
    command: 'set' | 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'insert' | 'remove' | 'push' | 'pop' | 'shift',
    path: string,
    valueOrArgs: any
): Record<string, any> => {
    const newVars = JSON.parse(JSON.stringify(currentVariables));
    
    // Mapping đơn giản sang logic mới
    if (command === 'set') set(newVars, path, valueOrArgs);
    else if (['add', 'sub', 'mul', 'div', 'mod'].includes(command)) mathOp(newVars, path, valueOrArgs, command as any);
    else if (command === 'push' || command === 'insert') {
        const arr = get(newVars, path);
        if (Array.isArray(arr)) arr.push(valueOrArgs);
    }
    
    return newVars;
};

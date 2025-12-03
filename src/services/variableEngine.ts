
import _ from 'lodash';

/**
 * VARIABLE ENGINE - TUPLE-AWARE PROXY SANDBOX (World-Class Standard)
 * 
 * Kiến trúc:
 * 1. Native Execution: Sử dụng `new Function` để đạt hiệu suất tối đa.
 * 2. Lodash Inheritance: Kế thừa lodash thật, chỉ override các hàm mutate dữ liệu.
 * 3. Tuple-Awareness: Tự động phát hiện và bảo tồn cấu trúc [Value, Description].
 * 4. Type Safety: Ép kiểu số học nghiêm ngặt cho các phép toán.
 * 5. Scope Isolation: Che khuất biến toàn cục (window, document...).
 */

// --- 1. UTILITIES ---

/**
 * Làm sạch chuỗi script từ AI.
 * Loại bỏ các thẻ XML rác (<Analysis>, <Thinking>) và chỉ giữ lại code JS hợp lệ.
 */
const extractScriptContent = (rawText: string): { script: string, cleanText: string } => {
    // Regex tìm khối <UpdateVariable> (không phân biệt hoa thường)
    const updateBlockRegex = /<UpdateVariable(?:variable)?>([\s\S]*?)<\/UpdateVariable(?:variable)?>/i;
    const match = rawText.match(updateBlockRegex);

    if (!match || !match[1]) {
        return { script: "", cleanText: rawText };
    }

    let rawContent = match[1];

    // Xóa các khối meta-data thường gặp trong output của LLM
    rawContent = rawContent
        .replace(/<Analysis>[\s\S]*?<\/Analysis>/gi, "")
        .replace(/<Thinking>[\s\S]*?<\/Thinking>/gi, "")
        .replace(/<Comment>[\s\S]*?<\/Comment>/gi, "")
        .trim();

    // Lọc dòng: Chỉ giữ lại các dòng có vẻ là code JS, loại bỏ markdown fences và labels
    const lines = rawContent.split('\n');
    const validLines = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (trimmed.startsWith('<')) return false; // Thẻ XML lẻ loi
        if (trimmed.startsWith('```')) return false; // Markdown fence
        if (/^[A-Za-z0-9_]+:\s*$/i.test(trimmed)) return false; // Label rác (VD: "Analysis:")
        return true;
    });

    let script = validLines.join('\n').trim();
    
    // Giải mã HTML entities cơ bản nếu AI lỡ encode code
    script = script
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&')
        .replace(/[\u2018\u2019]/g, "'") // Smart quotes -> Straight quotes
        .replace(/[\u201C\u201D]/g, '"');

    // Xóa khối lệnh khỏi văn bản hiển thị cuối cùng
    const cleanText = rawText.replace(updateBlockRegex, "").trim();

    return { script, cleanText };
};

/**
 * Chuẩn hóa đường dẫn biến số (Path Normalization).
 * Chuyển đổi: a['b'][0] -> a.b.0
 */
const normalizePath = (path: string): string => {
    if (!path) return '';
    return path
        .replace(/^stat_data\./, '') // Xóa prefix thường gặp trong V3
        .replace(/^variables\./, '')
        .replace(/\["([^"]+)"\]/g, '.$1')
        .replace(/\['([^']+)'\]/g, '.$1')
        .replace(/\[(\d+)\]/g, '.$1');
};

/**
 * Kiểm tra xem một giá trị có phải là Tuple của SillyTavern không.
 * Signature: [Value, Description (string)]
 */
const isTuple = (val: any): boolean => {
    return Array.isArray(val) && val.length === 2 && typeof val[1] === 'string';
};

/**
 * Lấy giá trị từ object (Deep Get) với khả năng tự động bóc tách Tuple.
 * @param unwrapTuple Nếu true, trả về giá trị bên trong Tuple. Nếu false, trả về raw Tuple.
 */
export const get = (obj: any, path: string, defaultValue: any = undefined, unwrapTuple: boolean = true): any => {
    const cleanPath = normalizePath(path);
    const val = _.get(obj, cleanPath);
    
    if (unwrapTuple && isTuple(val)) {
        return val[0];
    }
    
    return val === undefined ? defaultValue : val;
};

/**
 * Gán giá trị vào object (Deep Set) với khả năng bảo tồn Tuple.
 */
const set = (obj: any, path: string, value: any): void => {
    const cleanPath = normalizePath(path);
    
    // Lấy giá trị hiện tại để kiểm tra cấu trúc
    const currentVal = _.get(obj, cleanPath);

    if (isTuple(currentVal)) {
        // Nếu đích là Tuple, chỉ cập nhật giá trị (index 0), giữ nguyên mô tả (index 1)
        // Chúng ta tạo một mảng mới để đảm bảo tính bất biến (immutability) ở mức shallow nếu cần
        const newTuple = [value, currentVal[1]];
        _.set(obj, cleanPath, newTuple);
    } else {
        // Gán bình thường
        _.set(obj, cleanPath, value);
    }
};

/**
 * Xử lý các phép toán số học an toàn.
 * Tự động ép kiểu Number() để tránh lỗi cộng chuỗi.
 */
const mathOp = (obj: any, path: string, val: any, op: 'add' | 'sub' | 'mul' | 'div' | 'mod') => {
    // Lấy giá trị hiện tại (đã unwrap nếu là tuple)
    const currentRaw = get(obj, path, 0); 
    const currentNum = Number(currentRaw);
    const operand = Number(val);

    if (isNaN(operand)) return; // Bỏ qua nếu tham số không phải số
    // Nếu giá trị hiện tại không phải số (ví dụ null/undefined), mặc định là 0
    const safeCurrent = isNaN(currentNum) ? 0 : currentNum;

    let result = safeCurrent;
    switch (op) {
        case 'add': result += operand; break;
        case 'sub': result -= operand; break;
        case 'mul': result *= operand; break;
        case 'div': result = operand !== 0 ? result / operand : result; break; // Tránh chia cho 0
        case 'mod': result = operand !== 0 ? result % operand : result; break;
    }

    // Ghi lại giá trị (hàm set sẽ tự lo việc bảo tồn tuple)
    set(obj, path, result);
};

// --- 2. ENGINE CORE ---

/**
 * Tạo ra một phiên bản Lodash "lai" (Hybrid Lodash).
 * Nó kế thừa mọi hàm của lodash gốc, nhưng ghi đè các hàm thao tác dữ liệu
 * để phù hợp với logic của SillyTavern (Tuple, Math, Logging).
 */
const createHybridLodash = (scopeVariables: any, logger: (msg: string) => void) => {
    
    // Các hàm Override (Custom Logic)
    const customOverrides = {
        // --- Accessors ---
        get: (path: string, def?: any) => get(scopeVariables, path, def),
        
        set: (path: string, val: any, ...args: any[]) => {
            // Hỗ trợ cú pháp: _.set(path, oldVal, newVal) mà một số prompt AI hay dùng
            // Chúng ta luôn lấy đối số cuối cùng làm giá trị mới.
            const actualVal = args.length > 0 ? args[args.length - 1] : val;
            set(scopeVariables, path, actualVal);
            logger(`SET ${path} = ${JSON.stringify(actualVal)}`);
        },

        // --- Math Ops (Type Safe) ---
        add: (path: string, val: any) => { mathOp(scopeVariables, path, val, 'add'); logger(`ADD ${path} += ${val}`); },
        sub: (path: string, val: any) => { mathOp(scopeVariables, path, val, 'sub'); logger(`SUB ${path} -= ${val}`); },
        mul: (path: string, val: any) => { mathOp(scopeVariables, path, val, 'mul'); logger(`MUL ${path} *= ${val}`); },
        div: (path: string, val: any) => { mathOp(scopeVariables, path, val, 'div'); logger(`DIV ${path} /= ${val}`); },
        
        // --- Array/Object Polymorphic Ops ---
        
        // _.assign trong ST Scripts thường dùng đa năng:
        // 1. _.assign(arrayPath, value) -> Push vào mảng
        // 2. _.assign(objPath, key, value) -> Gán thuộc tính object
        assign: (path: string, ...args: any[]) => {
            // Lấy raw value (không unwrap) để kiểm tra xem nó là mảng hay tuple chứa mảng
            let target = get(scopeVariables, path, undefined, false); // Get raw

            // Nếu là Tuple [Array, Desc], lấy Array ra
            if (isTuple(target) && Array.isArray(target[0])) {
                target = target[0];
            } else if (isTuple(target)) {
                // Tuple nhưng không chứa mảng? Unwrap để xem có phải object không
                target = target[0];
            }

            // Case 1: Object Set (path, key, value)
            if (args.length >= 2) {
                const key = args[0];
                const value = args[1];
                const fullPath = `${path}.${key}`; // Nối chuỗi đơn giản, hàm set sẽ normalize sau
                set(scopeVariables, fullPath, value);
                logger(`ASSIGN (KEY) ${fullPath} = ${JSON.stringify(value)}`);
            } 
            // Case 2: Array Push (path, value)
            else if (args.length === 1) {
                const value = args[0];
                // Lấy lại target chính xác dưới dạng mảng (unwrap nếu cần)
                const arr = get(scopeVariables, path, undefined, true); 
                
                if (Array.isArray(arr)) {
                    // Xóa placeholder meta của ST nếu có (để mảng sạch)
                    if (arr.length === 1 && arr[0] === '$__META_EXTENSIBLE__$') {
                        arr.pop();
                    }
                    arr.push(value);
                    logger(`ASSIGN (PUSH) ${path} << ${JSON.stringify(value)}`);
                } else {
                    logger(`WARN: ASSIGN failed. Target at '${path}' is not an array.`);
                }
            }
        },

        // Array Specific
        push: (path: string, val: any) => {
            const arr = get(scopeVariables, path, undefined, true);
            if (Array.isArray(arr)) {
                arr.push(val);
                logger(`PUSH ${path} << ${JSON.stringify(val)}`);
            }
        },
        
        // ST script thường dùng 'insert' thay vì push
        insert: (path: string, val: any) => {
             const arr = get(scopeVariables, path, undefined, true);
             if (Array.isArray(arr)) {
                 arr.push(val);
                 logger(`INSERT ${path} << ${JSON.stringify(val)}`);
             }
        },
        
        remove: (path: string, val: any) => {
            const arr = get(scopeVariables, path, undefined, true);
            if (Array.isArray(arr)) {
                // Xóa phần tử khớp giá trị (Deep equality check)
                // Hỗ trợ xóa object trong mảng hoặc xóa string/number
                const idx = arr.findIndex(item => _.isEqual(item, val) || item === val);
                if (idx > -1) {
                    arr.splice(idx, 1);
                    logger(`REMOVE ${path} >> ${JSON.stringify(val)}`);
                }
            }
        },

        // Logger nội bộ
        log: (msg: any) => logger(`SCRIPT LOG: ${String(msg)}`)
    };

    // Tạo object mới kế thừa lodash gốc, sau đó ghi đè bằng customOverrides
    // Sử dụng Object.assign lên một object mới để đảm bảo 'this' context của lodash không bị gãy
    // (Lodash thường hoạt động như một functional library, nên copy properties là an toàn nhất)
    const hybrid = Object.assign({}, _, customOverrides);
    return hybrid;
};

/**
 * Hàm thực thi chính.
 * Chạy script trong sandbox an toàn và trả về biến số đã cập nhật.
 */
export const processVariableUpdates = (
    rawText: string,
    currentVariables: Record<string, any>
): { updatedVariables: Record<string, any>; cleanedText: string; variableLog: string } => {
    
    const { script, cleanText } = extractScriptContent(rawText);
    
    // Nếu không có script, trả về nguyên trạng
    if (!script) {
        return { 
            updatedVariables: currentVariables, 
            cleanedText: cleanText, 
            variableLog: '' 
        };
    }

    // Deep Copy biến số để đảm bảo tính bất biến (Immutability) cho React state
    const workingVariables = JSON.parse(JSON.stringify(currentVariables));
    
    const logMessages: string[] = [];
    const logger = (msg: string) => logMessages.push(msg);

    // Tạo thư viện _ (hybrid)
    const hybridLib = createHybridLodash(workingVariables, logger);

    logMessages.push('[JS ENGINE] Script detected. Executing...');

    try {
        // --- SANDBOX CONSTRUCTION ---
        // Sử dụng 'new Function' thay vì eval để có scope sạch hơn.
        // Truyền vào các tham số cần thiết và CHE KHUẤT (Shadow) các biến toàn cục.
        
        const safeRunner = new Function(
            'variables',   // Tham số 1: Object biến số
            '_',           // Tham số 2: Thư viện Lodash Hybrid
            'stat_data',   // Tham số 3: Alias cho variables (V3 hay dùng)
            'window', 'document', 'fetch', 'XMLHttpRequest', 'alert', 'console', // Shadowing globals -> undefined
            `
            "use strict";
            // Bắt lỗi bên trong script để không crash app
            try {
                ${script}
            } catch (e) {
                // Ném lỗi ra ngoài để engine bắt được
                throw e;
            }
            `
        );

        // Thực thi
        safeRunner(
            workingVariables, 
            hybridLib, 
            workingVariables, // stat_data trỏ cùng vùng nhớ với variables
            undefined, undefined, undefined, undefined, undefined, // Shadowed globals set to undefined
            { log: logger, error: logger, warn: logger } // Mock console
        );

        logMessages.push('[JS ENGINE] Execution successful.');

    } catch (e) {
        const errMessage = e instanceof Error ? e.message : String(e);
        logMessages.push(`[JS ENGINE ERROR] ${errMessage}`);
        console.error("Variable Script Error:", e);
        
        // Nếu lỗi, trả về biến số CŨ để tránh làm hỏng dữ liệu, nhưng vẫn trả về log lỗi và text sạch
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

/**
 * Legacy Wrapper - Để tương thích ngược với các module cũ gọi applyVariableOperation.
 * Chuyển hướng sang dùng logic mới của engine này.
 */
export const applyVariableOperation = (
    currentVariables: Record<string, any>,
    command: 'set' | 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'insert' | 'remove' | 'push',
    path: string,
    valueOrArgs: any
): Record<string, any> => {
    // Tạo bản sao
    const newVars = JSON.parse(JSON.stringify(currentVariables));
    
    // Mapping thủ công sang logic mới
    if (command === 'set') set(newVars, path, valueOrArgs);
    else if (['add', 'sub', 'mul', 'div', 'mod'].includes(command)) mathOp(newVars, path, valueOrArgs, command as any);
    else if (command === 'push' || command === 'insert') {
        const arr = get(newVars, path, undefined, true);
        if (Array.isArray(arr)) arr.push(valueOrArgs);
    }
    else if (command === 'remove') {
         const arr = get(newVars, path, undefined, true);
         if (Array.isArray(arr)) {
             const idx = arr.indexOf(valueOrArgs);
             if (idx > -1) arr.splice(idx, 1);
         }
    }
    
    return newVars;
};

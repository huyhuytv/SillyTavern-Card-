
import { GoogleGenAI } from "@google/genai";
import type { RPGDatabase, MedusaAction, MedusaResult } from '../types/rpg';
import type { WorldInfoEntry } from '../types';
import { parseLooseJson } from '../utils';

// --- CONFIGURATION ---

export const DEFAULT_MEDUSA_PROMPT = `
Bạn là một Medusa chuyên điền bảng biểu. Bạn cần tham khảo bối cảnh thiết lập trước đó cũng như <Dữ liệu chính văn> được gửi cho bạn để ghi lại dưới dạng bảng. 

Bạn cần:
1. Đọc <Cấu trúc bảng & Luật lệ> để hiểu ý nghĩa các cột và quy tắc cập nhật.
2. Đọc <Dữ liệu bảng hiện tại> để biết trạng thái hiện tại.
3. Tham khảo <Dữ liệu tham khảo> (nếu có) để hiểu các quy tắc thế giới, vật phẩm và chỉ số.
4. Thực hiện sửa đổi (Thêm/Sửa/Xóa) để phản ánh diễn biến mới nhất.

Đầu ra cuối cùng của bạn phải là định dạng văn bản thuần túy, tuân thủ nghiêm ngặt thứ tự <tableThink>, <tableCheck>, <tableEdit>. Bắt đầu trực tiếp bằng thẻ <tableThink> và kết thúc bằng thẻ </tableEdit>. Hướng dẫn điền cụ thể như sau:

## 《Hướng dẫn điền bảng dữ liệu》

<tableThink> (Khối suy nghĩ về bảng):
Chức năng: Chứa nội dung phân tích của AI, quá trình suy nghĩ để quyết định thao tác bảng. Mọi nội dung suy nghĩ phải được bao gồm hoàn toàn trong khối chú thích <!-- và -->.

Tóm tắt cốt truyện: Trước tiên, phải viết một bản tóm tắt cốt truyện hoàn chỉnh dựa trên dữ liệu chính văn do người dùng cung cấp. Lưu ý đặc biệt là người dùng có thể gửi nhiều lượt đối thoại, tóm tắt phải bao quát tất cả cốt truyện chính văn.

Nội dung tóm tắt: Mô tả đơn giản và đầy đủ toàn bộ cốt truyện diễn ra trong chính văn, bao gồm các thông tin có sự thay đổi.

Nắm bắt thay đổi: Tập trung vào trôi qua của thời gian, chuyển dịch địa điểm, thay đổi trạng thái/trải nghiệm/quan hệ của nhân vật, thu thập/tiêu hao vật phẩm, cập nhật tiến độ nhiệm vụ, v.v.

Ánh xạ chỉ mục bảng (Bước then chốt): Đọc kỹ <Cấu trúc bảng & Luật lệ> và <Dữ liệu bảng hiện tại>. Tiêu đề của mỗi bảng sẽ ghi rõ chỉ mục và tên của nó, định dạng là [Index:TableName].

Trích xuất chỉ mục thực: Bạn phải trích xuất trực tiếp con số trong ngoặc vuông làm tableIndex của bảng đó.

Nghiêm cấm đánh số lại: Tuyệt đối cấm bỏ qua chỉ mục trong tiêu đề và tự đếm bắt đầu từ 0! Nếu tiêu đề là [10:Bảng tóm tắt], thì chỉ mục của nó là 10, chứ không phải 0.

Danh sách ánh xạ: Phải liệt kê từng bảng tồn tại trong dữ liệu hiện tại và chỉ mục thực đã trích xuất được. Định dạng: [Chỉ mục thực] Tên bảng.

Quyết định thao tác: Sau khi hoàn thành tóm tắt và ánh xạ chỉ mục, dựa vào [Điều kiện kích hoạt Thêm/Xóa/Sửa] và [Mô tả cột] được định nghĩa trong <Cấu trúc bảng>, phân tích từng bảng xem cần thực hiện thao tác insertRow, updateRow, deleteRow nào.

Chỉ rõ tên bảng cần thao tác và tìm chỉ mục thực tương ứng dựa trên ánh xạ ở bước 2.

<tableCheck> (Khối kiểm tra các mục quan trọng):
Chức năng: Sau khi suy nghĩ chính, trước khi thực hiện lệnh, tiến hành kiểm tra cuối cùng các nhiệm vụ quan trọng. Mọi nội dung kiểm tra phải được bao gồm hoàn toàn trong khối chú thích <!-- và -->.

Xác nhận khởi tạo: Kiểm tra dữ liệu hiện tại của tất cả các bảng trong <Dữ liệu bảng hiện tại> xem có hiển thị "(Trống - Cần khởi tạo)" hay không. Nếu có và luật cho phép khởi tạo, hãy dùng lệnh insertRow.

Xác nhận định vị bảng (Fixed Check): Xác nhận tất cả tên bảng bạn dự định cập nhật thực sự tồn tại trong "Ánh xạ chỉ mục bảng". Nếu không tồn tại, cấm thao tác bảng đó.

Đối chiếu tham số chỉ mục (Fixed Check): Kiểm tra từng lệnh dự định tạo ra, xác nhận tham số tableIndex của nó hoàn toàn khớp với chỉ mục thực đã trích xuất.

Kiểm tra quy tắc mẫu: Thực hiện nghiêm ngặt các quy tắc [Kiểm tra] được định nghĩa trong mẫu bảng (như: kiểm tra tính duy nhất, kiểm tra định dạng, kiểm tra tính nhất quán, v.v.).

Tính nhất quán logic: Đảm bảo dữ liệu liên quan giữa các bảng khác nhau giữ được sự nhất quán về logic.

Đối chiếu số thứ tự cột và hàng: Phải đối chiếu xem số thứ tự cột (dựa trên Schema) và hàng (dựa trên Data) được điền có thỏa mãn vị trí tương ứng hay không.

<tableEdit> (Khối lệnh chỉnh sửa bảng):
Chức năng: Chứa các lệnh thao tác thực tế để cập nhật dữ liệu bảng (insertRow, updateRow, deleteRow). Mọi lệnh phải được bao gồm hoàn toàn trong khối chú thích <!-- và -->.

Yêu cầu bắt buộc về định dạng đầu ra:

Đầu ra văn bản thuần túy: Nghiêm ngặt tuân theo thứ tự <tableThink>, <tableCheck>, <tableEdit>.

Cấm đóng gói: Nghiêm cấm sử dụng khối mã markdown, dấu ngoặc kép để bao gói toàn bộ đầu ra.

Không ký tự thừa: Ngoài bản thân các lệnh, cấm thêm bất kỳ văn bản giải thích nào.

Cú pháp lệnh <tableEdit> (Tuân thủ nghiêm ngặt):

Loại thao tác: Chỉ giới hạn deleteRow, insertRow, updateRow.

Định dạng tham số:

tableIndex (Số thứ tự bảng): Phải sử dụng chỉ mục thực bạn trích xuất từ tiêu đề [Index:Name] trong bước ánh xạ.

rowIndex (Số thứ tự hàng): Tương ứng với chỉ số hàng trong <Dữ liệu bảng hiện tại> (số, bắt đầu từ 0).

colIndex (Số thứ tự cột): Phải là chuỗi ký tự trong dấu ngoặc kép (như "0", "1") tương ứng với thứ tự cột trong <Cấu trúc bảng>.

Ví dụ lệnh:

Chèn: insertRow(10, {"0": "Dữ liệu 1", "1": 100}) (Lưu ý: Nếu tiêu đề là [10:xxx], ở đây phải là 10)

Cập nhật: updateRow(0, 0, {"2": "Trạng thái mới", "3": true})

Xóa: deleteRow(2, 5)

-- CONTEXT --
<Cấu trúc bảng & Luật lệ>
{{rpg_schema}}
</Cấu trúc bảng & Luật lệ>

<Dữ liệu tham khảo (Lorebook)>
{{rpg_lorebook}}
</Dữ liệu tham khảo (Lorebook)>

<Dữ liệu bảng hiện tại>
{{rpg_data}}
</Dữ liệu bảng hiện tại>

<Dữ liệu chính văn>
{{chat_history}}
</Dữ liệu chính văn>

LUẬT CHUNG:
{{global_rules}}
`;

// --- HELPER FUNCTIONS ---

/**
 * Tạo chuỗi Schema: Mô tả cấu trúc bảng, các cột và luật lệ.
 */
const getDatabaseSchema = (db: RPGDatabase): string => {
    let output = "";
    
    db.tables.forEach((table, tableIndex) => {
        const { config } = table;
        
        // Header: [Index:TableName]
        output += `### [${tableIndex}:${config.name}]\n`;
        output += `  DESC: ${config.description || 'N/A'}\n`;
        
        if (config.aiRules) {
            if (config.aiRules.init) output += `  [Điều kiện Khởi tạo]: ${config.aiRules.init}\n`;
            if (config.aiRules.update) output += `  [Điều kiện Cập nhật]: ${config.aiRules.update}\n`;
            if (config.aiRules.insert) output += `  [Điều kiện Thêm mới]: ${config.aiRules.insert}\n`;
            if (config.aiRules.delete) output += `  [Điều kiện Xóa]: ${config.aiRules.delete}\n`;
        }

        // Schema Columns: [0] Label (Type), [1] Label (Type)...
        const schemaStr = config.columns.map((c, colIdx) => `["${colIdx}"] ${c.label} (${c.type})`).join(', ');
        output += `  [Mô tả cột (Schema)]: ${schemaStr}\n`;
        output += "\n";
    });

    return output;
};

/**
 * Tạo chuỗi Data: Chỉ chứa dữ liệu các dòng hiện tại.
 */
const getDatabaseData = (db: RPGDatabase): string => {
    let output = "";
    
    db.tables.forEach((table, tableIndex) => {
        const { config, data } = table;
        
        output += `### [${tableIndex}:${config.name}]\n`;
        output += `  DATA (Rows):\n`;
        
        if (!data.rows || data.rows.length === 0) {
            output += `    (Trống - Cần khởi tạo)\n`;
        } else {
            data.rows.forEach((row, rowIdx) => {
                // Row[0] luôn là UUID, bỏ qua khi hiển thị cho AI để tránh rối.
                // AI chỉ cần quan tâm Row Index (0, 1, 2...) để update/delete.
                // Map giá trị vào colIndex tương ứng: Row[1] -> col "0", Row[2] -> col "1"
                const values = row.slice(1).map((v, i) => `"${i}":${JSON.stringify(v)}`).join(', ');
                output += `    Row ${rowIdx}: { ${values} }\n`;
            });
        }
        output += "\n";
    });

    return output;
};

/**
 * Replace macros in prompt with actual data
 */
const resolveMedusaMacros = (prompt: string, db: RPGDatabase, historyLog: string, lorebookContext: string): string => {
    const schemaStr = getDatabaseSchema(db);
    const dataStr = getDatabaseData(db);
    const globalRules = db.globalRules || "";
    
    // Simple last user input extraction (last line starting with User:)
    const lastUserLineMatch = historyLog.match(/User: (.*)$/m);
    const lastUserInput = lastUserLineMatch ? lastUserLineMatch[1] : "";

    return prompt
        .replace('{{rpg_schema}}', schemaStr)
        .replace('{{rpg_data}}', dataStr)
        .replace('{{rpg_lorebook}}', lorebookContext) // Inject Hybrid Context
        .replace('{{global_rules}}', globalRules)
        .replace('{{chat_history}}', historyLog)
        .replace('{{last_user_input}}', lastUserInput);
};

// --- PARSER LOGIC (Lexical Parsing for Robustness) ---

/**
 * Parses the AI response string to extract commands using lexical analysis (Bracket Counting).
 * This replaces the fragile Regex-only approach to handle nested JSON correctly.
 */
const parseCustomActions = (rawText: string): MedusaAction[] => {
    const actions: MedusaAction[] = [];
    
    // 1. Extract <tableEdit> block
    const editBlockMatch = rawText.match(/<tableEdit>([\s\S]*?)<\/tableEdit>/);
    if (!editBlockMatch) return [];
    let content = editBlockMatch[1];
    
    // 2. Unwrap HTML comments and Clean Markdown
    // BUG FIX: Instead of removing content inside comments, we only remove the markers.
    // This allows AI to wrap valid code in comments (as per instructions) without it being deleted.
    content = content
        .replace(/<!--/g, '')
        .replace(/-->/g, '')
        .replace(/```[a-z]*\n?/gi, '') // Remove start code fence
        .replace(/```/g, '') // Remove end code fence
        .trim();

    // 3. Helper: Lexical Scanner to find balanced JSON object {...}
    const extractJson = (str: string, startPos: number): { json: any, endPos: number } | null => {
        let depth = 0;
        let inString = false;
        let quoteChar = '';
        let jsonStart = -1;

        // Find the first opening brace '{'
        for (let i = startPos; i < str.length; i++) {
            if (str[i] === '{') {
                jsonStart = i;
                break;
            }
        }
        if (jsonStart === -1) return null;

        // Iterate to find matching closing brace
        for (let i = jsonStart; i < str.length; i++) {
            const char = str[i];
            
            if (inString) {
                // If in string, only look for closing quote that isn't escaped
                if (char === quoteChar && str[i - 1] !== '\\') {
                    inString = false;
                }
            } else {
                if (char === '"' || char === "'") {
                    inString = true;
                    quoteChar = char;
                } else if (char === '{') {
                    depth++;
                } else if (char === '}') {
                    depth--;
                    if (depth === 0) {
                        // Found valid JSON string block
                        const jsonStr = str.substring(jsonStart, i + 1);
                        try {
                            // Use robust parser from utils (supports JSON5 features like single quotes)
                            // This fixes the issue with apostrophes in content
                            return { json: parseLooseJson(jsonStr), endPos: i + 1 };
                        } catch (e) {
                            console.warn("Medusa JSON Parse Error:", jsonStr, e);
                            return null;
                        }
                    }
                }
            }
        }
        return null;
    };

    // 4. Scan for commands
    const commandPattern = /(insertRow|updateRow|deleteRow)\s*\(/g;
    let match;

    while ((match = commandPattern.exec(content)) !== null) {
        const command = match[1];
        let currentPos = commandPattern.lastIndex;
        
        // Helper: Extract next number (Argument 1, etc.)
        const getNextNumber = (): number | null => {
            const sub = content.substring(currentPos);
            // Match number followed by comma OR closing parenthesis
            const numMatch = sub.match(/^\s*(\d+)\s*(,|(?=\)))/);
            if (numMatch) {
                currentPos += numMatch[0].length;
                return parseInt(numMatch[1], 10);
            }
            return null;
        };

        // All commands start with tableIndex
        const tableIndex = getNextNumber();
        if (tableIndex === null) continue;

        if (command === 'deleteRow') {
            // deleteRow(tableIdx, rowIdx)
            const rowIndex = getNextNumber();
            if (rowIndex !== null) {
                actions.push({ type: 'DELETE', tableIndex, rowIndex });
            }
        } else if (command === 'insertRow') {
            // insertRow(tableIdx, {json})
            const result = extractJson(content, currentPos);
            if (result) {
                actions.push({ type: 'INSERT', tableIndex, data: result.json });
                currentPos = result.endPos;
            }
        } else if (command === 'updateRow') {
            // updateRow(tableIdx, rowIdx, {json})
            const rowIndex = getNextNumber();
            if (rowIndex !== null) {
                const result = extractJson(content, currentPos);
                if (result) {
                    actions.push({ type: 'UPDATE', tableIndex, rowIndex, data: result.json });
                    currentPos = result.endPos;
                }
            }
        }
    }

    return actions;
};

/**
 * Thực thi các hành động lên bản sao Database.
 * Cần mapping từ Index (AI hiểu) -> ID (Code hiểu).
 */
const applyMedusaActions = (
    currentDb: RPGDatabase, 
    actions: MedusaAction[]
): { newDb: RPGDatabase; notifications: string[], logs: string[] } => {
    
    const newDb: RPGDatabase = JSON.parse(JSON.stringify(currentDb));
    const notifications: string[] = [];
    const logs: string[] = [];

    actions.forEach(action => {
        try {
            // MAP TABLE INDEX -> TABLE OBJECT
            if (typeof action.tableIndex !== 'number') return;
            const table = newDb.tables[action.tableIndex];
            
            if (!table) {
                logs.push(`[WARN] Table Index not found: ${action.tableIndex}`);
                return;
            }

            switch (action.type) {
                case 'UPDATE': {
                    if (typeof action.rowIndex !== 'number' || !action.data) break;
                    
                    const row = table.data.rows[action.rowIndex];
                    if (!row) {
                        logs.push(`[WARN] Row Index not found: ${action.tableIndex}:${action.rowIndex}`);
                        break;
                    }

                    // Map Column Indices ("0", "1") -> Actual Array Positions
                    // Lưu ý: row[0] là UUID, nên colIndex "0" từ AI ứng với row[1]
                    Object.entries(action.data).forEach(([colIdxStr, val]) => {
                        const colIdx = parseInt(colIdxStr);
                        if (!isNaN(colIdx) && colIdx >= 0 && colIdx < table.config.columns.length) {
                            row[colIdx + 1] = val; // +1 để nhảy qua UUID
                        }
                    });
                    
                    logs.push(`UPDATE ${table.config.name} (Row ${action.rowIndex})`);
                    break;
                }

                case 'INSERT': {
                    if (!action.data) break;

                    // Tạo dòng mới
                    const newId = `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    const newRow = new Array(table.config.columns.length + 1).fill(""); // +1 cho ID
                    newRow[0] = newId;

                    // Fill dữ liệu từ Col Index
                    Object.entries(action.data).forEach(([colIdxStr, val]) => {
                        const colIdx = parseInt(colIdxStr);
                        if (!isNaN(colIdx) && colIdx >= 0 && colIdx < table.config.columns.length) {
                            newRow[colIdx + 1] = val;
                        }
                    });

                    table.data.rows.push(newRow);
                    logs.push(`INSERT ${table.config.name} -> ID: ${newId}`);
                    
                    // Simple notification heuristic
                    if (table.config.name.toLowerCase().includes('túi') || table.config.name.toLowerCase().includes('item')) {
                        const itemName = newRow[1]; // Giả sử cột đầu tiên là tên
                        if (itemName) notifications.push(`Nhận được: ${itemName}`);
                    }
                    break;
                }

                case 'DELETE': {
                    if (typeof action.rowIndex !== 'number') break;
                    
                    if (action.rowIndex >= 0 && action.rowIndex < table.data.rows.length) {
                        const deletedRow = table.data.rows.splice(action.rowIndex, 1);
                        logs.push(`DELETE ${table.config.name} (Row ${action.rowIndex})`);
                        
                        if (table.config.name.toLowerCase().includes('túi')) {
                             const itemName = deletedRow[0][1];
                             if (itemName) notifications.push(`Đã dùng/vứt bỏ: ${itemName}`);
                        }
                    }
                    break;
                }
            }
        } catch (e) {
            logs.push(`[ERROR] Processing action ${action.type}: ${e instanceof Error ? e.message : String(e)}`);
        }
    });

    newDb.lastUpdated = Date.now();
    return { newDb, notifications, logs };
};

// --- MAIN SERVICE ---

export const MedusaService = {
    processTurn: async (
        historyLog: string,
        database: RPGDatabase,
        apiKey: string,
        activeChatEntries: WorldInfoEntry[], // New argument
        allAvailableEntries: WorldInfoEntry[], // New argument
        defaultModelId: string = 'gemini-2.5-pro'
    ): Promise<MedusaResult> => { // Explicit Return Type
        const ai = new GoogleGenAI({ apiKey });
        
        // 1. Determine Model
        const targetModel = database.settings?.modelId || defaultModelId;

        // 2. Prepare Hybrid Context
        const pinnedUids = database.settings?.pinnedLorebookUids || [];
        const uniqueEntriesMap = new Map<string, WorldInfoEntry>();

        // A. Add Pinned Entries
        pinnedUids.forEach(uid => {
            const entry = allAvailableEntries.find(e => e.uid === uid);
            if (entry) uniqueEntriesMap.set(uid, entry);
        });

        // B. Add Active Entries (Scan Result)
        activeChatEntries.forEach(entry => {
            if (entry.uid) uniqueEntriesMap.set(entry.uid, entry);
        });

        // Format to Markdown
        let lorebookContext = "";
        uniqueEntriesMap.forEach(entry => {
            lorebookContext += `### [Lore: ${entry.comment || 'Untitled'}]\n${entry.content}\n\n`;
        });
        if (!lorebookContext) lorebookContext = "(Không có dữ liệu tham khảo)";

        // 3. Construct System Prompt
        const rawSystemPrompt = database.settings?.customSystemPrompt || DEFAULT_MEDUSA_PROMPT;
        const resolvedSystemPrompt = resolveMedusaMacros(rawSystemPrompt, database, historyLog, lorebookContext);

        try {
            const response = await ai.models.generateContent({
                model: targetModel,
                contents: resolvedSystemPrompt, 
                config: {
                    temperature: 0.1,
                    // Không dùng responseMimeType: "application/json" vì output là text chứa thẻ XML
                }
            });

            const rawText = response.text || "";
            
            // Extract Logic (Think & Check) for logging
            const thinkMatch = rawText.match(/<tableThink>([\s\S]*?)<\/tableThink>/);
            const thinkContent = thinkMatch ? thinkMatch[1].replace(/<!--|-->/g, '').trim() : "No thinking data.";
            
            const actions = parseCustomActions(rawText);

            if (actions.length > 0) {
                const { newDb, notifications, logs } = applyMedusaActions(database, actions);
                // Prepend thinking logic to logs
                logs.unshift(`[Thinking]: ${thinkContent.substring(0, 200)}...`);
                
                return {
                    success: true,
                    newDb: newDb,
                    notifications: notifications,
                    logs: logs,
                    rawActions: actions,
                    debugInfo: {
                        prompt: resolvedSystemPrompt,
                        rawResponse: rawText
                    }
                };
            } else {
                return {
                    success: true,
                    newDb: database,
                    notifications: [],
                    logs: [`[Thinking]: ${thinkContent.substring(0, 100)}...`, "No actions required."],
                    rawActions: actions,
                    debugInfo: {
                        prompt: resolvedSystemPrompt,
                        rawResponse: rawText
                    }
                };
            }

        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : String(error), 
                logs: [],
                debugInfo: {
                    prompt: resolvedSystemPrompt,
                    rawResponse: `Error: ${error instanceof Error ? error.message : String(error)}`
                }
            };
        }
    }
};

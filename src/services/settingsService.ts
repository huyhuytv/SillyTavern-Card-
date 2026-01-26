
const ACTIVE_MODEL_KEY = 'sillyTavernStudio_activeModel'; // Legacy, kept for fallback
const API_SETTINGS_KEY = 'sillyTavernStudio_apiSettings';
const API_KEY_INDEX_KEY = 'sillyTavernStudio_apiKeyIndex';
const OPENROUTER_API_KEY_KEY = 'sillyTavernStudio_openRouterApiKey';
const PROXY_URL_KEY = 'sillyTavernStudio_proxyUrl';
const PROXY_PASSWORD_KEY = 'sillyTavernStudio_proxyPassword';
const PROXY_LEGACY_MODE_KEY = 'sillyTavernStudio_proxyLegacyMode';
const PROXY_FOR_TOOLS_KEY = 'sillyTavernStudio_proxyForTools';
const GLOBAL_CONNECTION_KEY = 'sillyTavernStudio_globalConnection';
const GLOBAL_SMART_SCAN_KEY = 'sillyTavernStudio_smartScanGlobal'; // NEW KEY

// ... (Existing options and interfaces remain same) ...
export const MODEL_OPTIONS = [
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro Preview' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash Preview' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini 2.5 Flash-Lite' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
];

export const PROXY_MODEL_OPTIONS = [
    ...MODEL_OPTIONS,
    { id: 'claude-opus-4.5', name: 'Claude Opus 4.5' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
    { id: 'gpt-4o', name: 'GPT-4o' }
];

export type CompletionSource = 'gemini' | 'openrouter' | 'proxy';
export type ProxyProtocol = 'openai' | 'google_native';

export interface GlobalConnectionSettings {
    source: CompletionSource;
    gemini_model: string;
    openrouter_model: string;
    proxy_model: string;      // Dùng cho Chat chính
    proxy_tool_model: string; // Dùng cho Tác vụ phụ (Scan, Tóm tắt, Dịch)
    proxy_protocol: ProxyProtocol; // NEW: Protocol selection
}

// NEW INTERFACE: Global Smart Scan Configuration
export interface GlobalSmartScanSettings {
    enabled: boolean;
    mode: 'keyword' | 'hybrid' | 'ai_only';
    model: string;
    depth: number;
    max_entries: number;
    aiStickyDuration: number;
    system_prompt: string;
    scan_strategy: 'efficient' | 'full'; // NEW FIELD
}

const DEFAULT_CONNECTION_SETTINGS: GlobalConnectionSettings = {
    source: 'gemini',
    gemini_model: 'gemini-3-pro-preview',
    openrouter_model: '',
    proxy_model: 'gemini-3-pro-preview',
    proxy_tool_model: 'gemini-3-flash-preview',
    proxy_protocol: 'openai' // Default to OpenAI standard
};

// Default Prompt extracted from previous defaultPreset
export const DEFAULT_SMART_SCAN_PROMPT = `Bạn là Predictive Context Engine (PCE) - Động cơ Dự đoán Ngữ cảnh cho hệ thống nhập vai thế hệ mới.

NHIỆM VỤ TỐI THƯỢNG:
Chọn lọc các mục World Info (WI) từ danh sách ứng viên dựa trên hành động hiện tại VÀ dự đoán nhu cầu tương lai của người chơi.

------------------------------------------
PHÂN VÙNG DỮ LIỆU (QUAN TRỌNG)
------------------------------------------

A. VÙNG THAM KHẢO (READ-ONLY):
   Dùng để hiểu ngữ cảnh. TUYỆT ĐỐI KHÔNG CHỌN ID TỪ ĐÂY.
   1. <KIẾN THỨC NỀN>: {{context}}
   2. <TRẠNG THÁI HIỆN TẠI>: {{state}}
   3. <LỊCH SỬ HỘI THOẠI>: {{history}}

B. VÙNG KÍCH HOẠT:
   <HÀNH ĐỘNG MỚI NHẤT>: {{input}}

C. VÙNG ỨNG VIÊN (SELECTABLE):
   Chỉ được phép trích xuất ID từ danh sách này.
   <DANH SÁCH ỨNG VIÊN WI>: {{candidates}}

------------------------------------------
QUY TRÌNH TƯ DUY (AGENTIC WORKFLOW)
------------------------------------------

BƯỚC 1: PHÂN TÍCH & QUÉT TRẠNG THÁI
- Ý định của User là gì? (Chiến đấu, Giao tiếp, Di chuyển?)
- Kiểm tra {{state}}: Có biến số nào ở mức báo động không?
  * Ví dụ: Nếu \`stamina < 5\`, cần tìm WI về 'Kiệt sức' hoặc 'Nghỉ ngơi'.

BƯỚC 2: DỰ ĐOÁN TƯƠNG LAI (Predictive Modeling)
- Dựa vào Input, điều gì CÓ KHẢ NĂNG CAO sẽ xảy ra trong 1-2 lượt tới?
  * Ví dụ: User "Rút kiếm" -> Dự đoán cần WI "Hệ thống chiến đấu" hoặc "Kỹ năng kiếm thuật".
  * Ví dụ: User "Bước vào hầm ngục" -> Dự đoán cần WI "Cạm bẫy" hoặc "Quái vật khu vực".

BƯỚC 3: LỌC HAI LỚP (Dual-Layer Filtering)
- Lớp 1 (Chính xác): Quét {{candidates}} tìm các mục khớp từ khóa trực tiếp với Input (Tên riêng, vật phẩm, địa danh).
- Lớp 2 (Dự đoán): Quét {{candidates}} tìm các mục khớp với kịch bản dự đoán ở Bước 2 hoặc trạng thái nguy cấp ở Bước 1.

BƯỚC 4: KIỂM TRA & LOẠI TRỪ
- Hợp nhất kết quả Lớp 1 và Lớp 2.
- LOẠI BỎ các mục đã có sẵn trong phần {{context}} hoặc {{history}} (để tránh dư thừa).
- Nếu không có mục nào phù hợp, trả về danh sách rỗng.

------------------------------------------
CẤU TRÚC OUTPUT JSON
------------------------------------------
{
  "_thought": "1. Ý định: [...]. 2. Dự đoán: [Người chơi sắp làm X, cần thông tin Y]. 3. Lọc: [Tìm thấy ID khớp trực tiếp là A, ID dự đoán là B].",
  "selected_ids": ["uid_1", "uid_2"]
}`;

export const DEFAULT_SMART_SCAN_SETTINGS: GlobalSmartScanSettings = {
    enabled: true,
    mode: 'ai_only', // Default to advanced mode
    model: 'gemini-flash-lite-latest',
    depth: 6,
    max_entries: 20,
    aiStickyDuration: 5,
    system_prompt: DEFAULT_SMART_SCAN_PROMPT,
    scan_strategy: 'efficient' // Default to truncation logic
};


const DEFAULT_PROXY_URL = 'http://127.0.0.1:8889';

interface ApiSettings {
    useDefault: boolean;
    keys: string[];
}

export const getConnectionSettings = (): GlobalConnectionSettings => {
    try {
        const stored = localStorage.getItem(GLOBAL_CONNECTION_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...DEFAULT_CONNECTION_SETTINGS, ...parsed };
        }
    } catch (e) {
        console.error("Failed to load connection settings", e);
    }
    return DEFAULT_CONNECTION_SETTINGS;
};

export const saveConnectionSettings = (settings: GlobalConnectionSettings): void => {
    localStorage.setItem(GLOBAL_CONNECTION_KEY, JSON.stringify(settings));
};

// --- NEW GLOBAL SMART SCAN SETTINGS ---
export const getGlobalSmartScanSettings = (): GlobalSmartScanSettings => {
    try {
        const stored = localStorage.getItem(GLOBAL_SMART_SCAN_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge with defaults to ensure new fields are present during migration
            return { ...DEFAULT_SMART_SCAN_SETTINGS, ...parsed };
        }
    } catch (e) {
        console.error("Failed to load smart scan global settings", e);
    }
    return DEFAULT_SMART_SCAN_SETTINGS;
};

export const saveGlobalSmartScanSettings = (settings: GlobalSmartScanSettings): void => {
    localStorage.setItem(GLOBAL_SMART_SCAN_KEY, JSON.stringify(settings));
};
// --------------------------------------

export const getActiveModel = (): string => {
    const conn = getConnectionSettings();
    switch (conn.source) {
        case 'openrouter':
            return conn.openrouter_model || 'google/gemini-pro-1.5';
        case 'proxy':
            return conn.proxy_model || 'gemini-3-pro-preview';
        case 'gemini':
        default:
            return conn.gemini_model || 'gemini-3-pro-preview';
    }
};

export const setActiveModel = (modelId: string): void => {
    const conn = getConnectionSettings();
    const newConn = { ...conn };
    if (newConn.source === 'gemini') newConn.gemini_model = modelId;
    else if (newConn.source === 'proxy') newConn.proxy_model = modelId;
    else if (newConn.source === 'openrouter') newConn.openrouter_model = modelId;
    
    saveConnectionSettings(newConn);
};

export const getApiSettings = (): ApiSettings => {
    try {
        const storedSettings = localStorage.getItem(API_SETTINGS_KEY);
        if (storedSettings) {
            const parsed = JSON.parse(storedSettings);
            if (Array.isArray(parsed.keys)) {
                return { useDefault: parsed.useDefault ?? true, keys: parsed.keys };
            }
        }
    } catch (e) {
        console.error("Failed to parse API settings from localStorage", e);
    }
    return { useDefault: true, keys: [] };
};

export const saveApiSettings = (settings: ApiSettings): void => {
    localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
};

export const getApiKey = (): string | undefined => {
    const settings = getApiSettings();
    if (settings.useDefault) {
        return process.env.API_KEY;
    }
    const validKeys = settings.keys.filter(k => k.trim() !== '');
    if (validKeys.length === 0) {
        return process.env.API_KEY;
    }
    try {
        const lastIndexStr = localStorage.getItem(API_KEY_INDEX_KEY);
        const lastIndex = lastIndexStr ? parseInt(lastIndexStr, 10) : -1;
        const nextIndex = (lastIndex + 1) % validKeys.length;
        localStorage.setItem(API_KEY_INDEX_KEY, String(nextIndex));
        return validKeys[nextIndex];
    } catch (e) {
        return validKeys[0];
    }
};

export const getOpenRouterApiKey = (): string => {
    return localStorage.getItem(OPENROUTER_API_KEY_KEY) || '';
};

export const saveOpenRouterApiKey = (key: string): void => {
    localStorage.setItem(OPENROUTER_API_KEY_KEY, key.trim());
};

export const getProxyUrl = (): string => {
    return localStorage.getItem(PROXY_URL_KEY) || DEFAULT_PROXY_URL;
};

export const saveProxyUrl = (url: string): void => {
    const cleanUrl = url.trim().replace(/\/$/, '');
    localStorage.setItem(PROXY_URL_KEY, cleanUrl);
};

export const getProxyPassword = (): string => {
    return localStorage.getItem(PROXY_PASSWORD_KEY) || '';
};

export const saveProxyPassword = (password: string): void => {
    localStorage.setItem(PROXY_PASSWORD_KEY, password.trim());
};

export const getProxyLegacyMode = (): boolean => {
    const val = localStorage.getItem(PROXY_LEGACY_MODE_KEY);
    return val !== 'false';
};

export const saveProxyLegacyMode = (isLegacy: boolean): void => {
    localStorage.setItem(PROXY_LEGACY_MODE_KEY, String(isLegacy));
};

export const getProxyForTools = (): boolean => {
    return localStorage.getItem(PROXY_FOR_TOOLS_KEY) === 'true';
};

export const saveProxyForTools = (enabled: boolean): void => {
    localStorage.setItem(PROXY_FOR_TOOLS_KEY, String(enabled));
};

/**
 * EXPORT: Get all persistent settings from LocalStorage for backup.
 */
export const getAllLocalStorageData = (): Record<string, any> => {
    const data: Record<string, any> = {};
    const keys = [
        ACTIVE_MODEL_KEY, API_SETTINGS_KEY, API_KEY_INDEX_KEY, 
        OPENROUTER_API_KEY_KEY, PROXY_URL_KEY, PROXY_PASSWORD_KEY, 
        PROXY_LEGACY_MODE_KEY, PROXY_FOR_TOOLS_KEY, GLOBAL_CONNECTION_KEY,
        GLOBAL_SMART_SCAN_KEY // Include new key in backup
    ];
    
    keys.forEach(key => {
        const val = localStorage.getItem(key);
        if (val !== null) data[key] = val;
    });
    
    return data;
};

/**
 * RESTORE: Apply settings back to LocalStorage.
 */
export const restoreLocalStorageData = (data: Record<string, any>): void => {
    Object.entries(data).forEach(([key, val]) => {
        if (typeof val === 'string') {
            localStorage.setItem(key, val);
        }
    });
};

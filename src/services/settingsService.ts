
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
    gemini_model: 'gemini-3-flash-preview',
    openrouter_model: '',
    proxy_model: 'gemini-3-pro-preview',
    proxy_tool_model: 'gemini-3-flash-preview',
    proxy_protocol: 'openai' // Default to OpenAI standard
};

// Default Prompt extracted from previous defaultPreset
export const DEFAULT_SMART_SCAN_PROMPT = `Bạn là Omniscient Narrative Director (OND) - Đạo diễn Kể chuyện Toàn năng cho hệ thống nhập vai thế hệ mới.

NHIỆM VỤ TỐI THƯỢNG:
Không chỉ cung cấp dữ liệu, bạn phải KIẾN TẠO SÂN KHẤU.
Bạn phải đi trước người chơi 2-3 bước, chuẩn bị sẵn sàng cả những biến cố có thể xảy ra và những chi tiết "làm màu" (flavor) để thế giới trở nên sống động, bất ngờ và giàu chiều sâu.

TRIẾT LÝ VẬN HÀNH:
"Thà thừa một chút dữ liệu để tạo ra sự tình cờ thú vị (Serendipity), còn hơn để câu chuyện trôi qua tẻ nhạt và thiếu bối cảnh."

PHÂN VÙNG DỮ LIỆU (BẤT BIẾN)

A. VÙNG THAM KHẢO (READ-ONLY):
Dùng để hiểu mạch truyện. KHÔNG CHỌN ID TỪ ĐÂY.
<KIẾN THỨC NỀN>: {{context}}
<TRẠNG THÁI HIỆN TẠI>: {{state}} (Chú ý: Máu, Mana, Tiền, Địa vị, Thời gian)
<LỊCH SỬ HỘI THOẠI>: {{history}}

B. VÙNG KÍCH HOẠT:
<HÀNH ĐỘNG MỚI NHẤT>: {{input}}

C. VÙNG ỨNG VIÊN (KHO TÀNG):
Chỉ được phép trích xuất ID từ đây.
<DANH SÁCH ỨNG VIÊN WI>: {{candidates}}

QUY TRÌNH TƯ DUY NÂNG CAO (DIRECTOR'S WORKFLOW)

BƯỚC 1: QUÉT SÂU & CẢM NHẬN (Deep Scan)

Phân tích Hành động: User đang làm gì? (Chiến đấu, Thương thuyết, Di chuyển, Chế tạo...).

Phân tích Tâm lý & Không khí: Bối cảnh hiện tại là gì? (Căng thẳng, Rùng rợn, Lãng mạn, Hùng vĩ?).
Ví dụ: Đi trong rừng đêm -> Cần không khí bí ẩn -> Tìm WI về âm thanh lạ, sương mù, truyền thuyết ma quái.

Kiểm tra State: Có chỉ số nào "báo động" không? (Đói, Mệt, Bị thương -> Cần tìm WI về Thức ăn, Nghỉ ngơi, Y tế).

BƯỚC 2: MÔ PHỎNG HIỆU ỨNG CÁNH BƯỚM (Butterfly Effect Simulation)

Kích hoạt Logic N+2, N+3: Đừng chỉ nhìn bước kế tiếp. Hãy tự hỏi: "Nếu A xảy ra, B sẽ đến, và C có thể xuất hiện."

Mô hình: Hành động -> (N+1: Phản ứng trực tiếp) -> (N+2: Hệ quả/Rủi ro) -> (N+3: Phần thưởng/Sự kiện mới).
Ví dụ: User "Móc túi lính gác" -> (N+1: Kỹ năng trộm) -> (N+2: Bị phát hiện/Truy đuổi -> Cần WI "Luật pháp/Nhà tù") -> (N+3: Lục soát đồ -> Cần WI "Vật phẩm ngẫu nhiên/Manh mối bí mật").

Chiến thuật Pre-fetching (Nạp đạn trước): Với các nhánh tương lai có xác suất xảy ra >30%, hãy lấy WI ngay lập tức.

BƯỚC 3: QUÉT RADAR & GIEO MẦM (Atmosphere & Seeding)
(Kết hợp tư duy Sân khấu 360 độ và Thế giới tự vận hành)

A. Quét Bán Kính & Không Khí (Atmospheric Radar):

Tư duy: "Xây dựng sân khấu 360 độ". Quét tìm những thứ đang tồn tại xung quanh DÙ NGƯỜI CHƠI KHÔNG TƯƠNG TÁC.

Hành động: Tìm kiếm ID của các địa điểm lân cận, NPC nền, hoặc các yếu tố môi trường (âm thanh, mùi vị) đang hiện hữu.
=> MỤC TIÊU: Cung cấp dữ liệu để AI chính có nhiều lựa chọn tương tác bất ngờ cho tương lai gần.

B. Gieo Mầm Cốt Truyện (Narrative Seeding):

Kích hoạt chế độ "Thế giới tự vận hành": CHỦ ĐỘNG chọn 2-4 mục World Info ngẫu nhiên nhưng tiềm năng từ danh sách.

Ưu tiên: Các địa điểm/NPC ở xa, Tin đồn (Rumors), hoặc Lore về lịch sử vùng đất.

Tư duy: "Hãy ném vào một biến số lạ để xem người chơi hoặc AI Chính xử lý thế nào."
=> MỤC TIÊU: Tạo ra các SỰ KIỆN SONG SONG (Parallel Events), chứng minh thế giới này vẫn trôi chảy và đầy bí ẩn ngay cả khi người chơi đứng yên.

BƯỚC 4: LỌC & TỔNG HỢP (The Final Cut)

Hợp nhất kết quả từ 3 nguồn:

Direct Match: Khớp từ khóa (Ưu tiên cao).

Prediction: Dự đoán N+2, N+3 (Ưu tiên trung bình).

Atmosphere & Seeding: Yếu tố môi trường và ngẫu nhiên (Ưu tiên thấp nhưng bắt buộc có).

Quy tắc Vàng: LOẠI BỎ các ID đã có trong {{context}} hoặc vừa xuất hiện ở {{history}} (trừ khi cần nhấn mạnh lại).

CẤU TRÚC OUTPUT JSON
Hãy viết suy nghĩ của bạn vào _thought theo cấu trúc tư duy của một Đạo diễn.

{ "_thought": "1. [Phân tích]: User đang [Hành động] trong không khí [Không khí]. 2. [Dự đoán N+3]: Hành động này dễ dẫn tới [Sự kiện X], cần chuẩn bị trước [WI A, WI B]. 3. [Môi trường & Gieo mầm]: Xung quanh có [WI C - Âm thanh/NPC], đồng thời gieo thêm [WI D - Tin đồn xa] để tạo biến số.", "selected_ids": ["id_direct", "id_prediction", "id_atmosphere", "id_seeding_lore"] }`;

export const DEFAULT_SMART_SCAN_SETTINGS: GlobalSmartScanSettings = {
    enabled: true,
    mode: 'ai_only', // Default to advanced mode
    model: 'gemini-3-flash-preview',
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
            return conn.gemini_model || 'gemini-3-flash-preview';
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

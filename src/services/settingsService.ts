
const ACTIVE_MODEL_KEY = 'sillyTavernStudio_activeModel';
const API_SETTINGS_KEY = 'sillyTavernStudio_apiSettings';
const API_KEY_INDEX_KEY = 'sillyTavernStudio_apiKeyIndex';
const OPENROUTER_API_KEY_KEY = 'sillyTavernStudio_openRouterApiKey';

export const MODEL_OPTIONS = [
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro Preview' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini 2.5 Flash-Lite' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
];

const DEFAULT_MODEL_ID = 'gemini-3-pro-preview';

interface ApiSettings {
    useDefault: boolean;
    keys: string[];
}

/**
 * Lấy mô hình Gemini đang hoạt động từ localStorage.
 * @returns {string} ID của mô hình đã chọn hoặc mô hình mặc định.
 */
export const getActiveModel = (): string => {
    return localStorage.getItem(ACTIVE_MODEL_KEY) || DEFAULT_MODEL_ID;
};

/**
 * Đặt mô hình Gemini đang hoạt động trong localStorage.
 * @param {string} modelId ID của mô hình để lưu.
 */
export const setActiveModel = (modelId: string): void => {
    localStorage.setItem(ACTIVE_MODEL_KEY, modelId);
};

/**
 * Lấy cài đặt API từ localStorage.
 * @returns {ApiSettings} Cài đặt API đã lưu hoặc mặc định.
 */
export const getApiSettings = (): ApiSettings => {
    try {
        const storedSettings = localStorage.getItem(API_SETTINGS_KEY);
        if (storedSettings) {
            const parsed = JSON.parse(storedSettings);
            // Ensure keys is an array
            if (Array.isArray(parsed.keys)) {
                return { useDefault: parsed.useDefault ?? true, keys: parsed.keys };
            }
        }
    } catch (e) {
        console.error("Failed to parse API settings from localStorage", e);
    }
    return { useDefault: true, keys: [] };
};

/**
 * Lưu cài đặt API vào localStorage.
 * @param {ApiSettings} settings Cài đặt để lưu.
 */
export const saveApiSettings = (settings: ApiSettings): void => {
    localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
};


/**
 * Lấy API key tiếp theo để sử dụng, xử lý việc xoay vòng.
 * @returns {string | undefined} API key để sử dụng hoặc undefined nếu không có key nào được cấu hình.
 */
export const getApiKey = (): string | undefined => {
    const settings = getApiSettings();

    if (settings.useDefault) {
        return process.env.API_KEY;
    }

    const validKeys = settings.keys.filter(k => k.trim() !== '');
    if (validKeys.length === 0) {
        // Không có key cá nhân nào được cung cấp, nhưng key mặc định đã bị tắt.
        // Dự phòng bằng biến môi trường nếu có.
        return process.env.API_KEY;
    }

    try {
        const lastIndexStr = localStorage.getItem(API_KEY_INDEX_KEY);
        const lastIndex = lastIndexStr ? parseInt(lastIndexStr, 10) : -1;
        
        const nextIndex = (lastIndex + 1) % validKeys.length;
        
        localStorage.setItem(API_KEY_INDEX_KEY, String(nextIndex));
        
        return validKeys[nextIndex];

    } catch (e) {
        console.error("Lỗi trong quá trình xoay vòng API key, sử dụng key đầu tiên.", e);
        return validKeys[0];
    }
};

/**
 * Lấy API key của OpenRouter từ localStorage.
 * @returns {string} API key đã lưu hoặc một chuỗi rỗng.
 */
export const getOpenRouterApiKey = (): string => {
    return localStorage.getItem(OPENROUTER_API_KEY_KEY) || '';
};

/**
 * Lưu API key của OpenRouter vào localStorage.
 * @param {string} key API key để lưu.
 */
export const saveOpenRouterApiKey = (key: string): void => {
    localStorage.setItem(OPENROUTER_API_KEY_KEY, key.trim());
};


const ACTIVE_MODEL_KEY = 'sillyTavernStudio_activeModel'; // Legacy, kept for fallback
const API_SETTINGS_KEY = 'sillyTavernStudio_apiSettings';
const API_KEY_INDEX_KEY = 'sillyTavernStudio_apiKeyIndex';
const OPENROUTER_API_KEY_KEY = 'sillyTavernStudio_openRouterApiKey';
const PROXY_URL_KEY = 'sillyTavernStudio_proxyUrl';
const PROXY_PASSWORD_KEY = 'sillyTavernStudio_proxyPassword';
const PROXY_LEGACY_MODE_KEY = 'sillyTavernStudio_proxyLegacyMode';
const PROXY_FOR_TOOLS_KEY = 'sillyTavernStudio_proxyForTools';
const GLOBAL_CONNECTION_KEY = 'sillyTavernStudio_globalConnection';

export const MODEL_OPTIONS = [
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro Preview' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash Preview' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini 2.5 Flash-Lite' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
];

// Danh sách mở rộng dành riêng cho Proxy (Bao gồm Gemini + Claude + GPT...)
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

const DEFAULT_CONNECTION_SETTINGS: GlobalConnectionSettings = {
    source: 'gemini',
    gemini_model: 'gemini-3-pro-preview',
    openrouter_model: '',
    proxy_model: 'gemini-3-pro-preview',
    proxy_tool_model: 'gemini-3-flash-preview',
    proxy_protocol: 'openai' // Default to OpenAI standard
};

const DEFAULT_PROXY_URL = 'http://127.0.0.1:8889';

interface ApiSettings {
    useDefault: boolean;
    keys: string[];
}

/**
 * Get the global connection settings (Source + Models for each source).
 */
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

/**
 * Save global connection settings.
 */
export const saveConnectionSettings = (settings: GlobalConnectionSettings): void => {
    localStorage.setItem(GLOBAL_CONNECTION_KEY, JSON.stringify(settings));
};

/**
 * Lấy mô hình đang hoạt động dựa trên Nguồn (Source) hiện tại.
 * Used by Tools/Analysis to know which model ID to target.
 */
export const getActiveModel = (): string => {
    const conn = getConnectionSettings();
    switch (conn.source) {
        case 'openrouter':
            return conn.openrouter_model || 'google/gemini-pro-1.5'; // Fallback
        case 'proxy':
            return conn.proxy_model || 'gemini-3-pro-preview';
        case 'gemini':
        default:
            return conn.gemini_model || 'gemini-3-pro-preview';
    }
};

/**
 * @deprecated Legacy setter. Use saveConnectionSettings instead.
 * Kept for compatibility if other components call it directly.
 */
export const setActiveModel = (modelId: string): void => {
    const conn = getConnectionSettings();
    // Assuming if this is called, we update the model for the current source
    const newConn = { ...conn };
    if (newConn.source === 'gemini') newConn.gemini_model = modelId;
    else if (newConn.source === 'proxy') newConn.proxy_model = modelId;
    else if (newConn.source === 'openrouter') newConn.openrouter_model = modelId;
    
    saveConnectionSettings(newConn);
};

/**
 * Lấy cài đặt API Keys Gemini từ localStorage.
 */
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

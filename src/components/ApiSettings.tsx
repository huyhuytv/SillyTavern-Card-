
import React, { useState, useEffect, useMemo } from 'react';
import { 
    getConnectionSettings, 
    saveConnectionSettings, 
    MODEL_OPTIONS, 
    PROXY_MODEL_OPTIONS,
    getApiSettings, 
    saveApiSettings, 
    getOpenRouterApiKey, 
    saveOpenRouterApiKey, 
    getProxyUrl, 
    saveProxyUrl, 
    getProxyPassword, 
    saveProxyPassword, 
    getProxyLegacyMode, 
    saveProxyLegacyMode, 
    getProxyForTools, 
    saveProxyForTools,
    GlobalConnectionSettings,
    CompletionSource,
    ProxyProtocol
} from '../services/settingsService';
import { validateOpenRouterKey, getOpenRouterModels } from '../services/geminiService';
import type { OpenRouterModel } from '../types';
import { Loader } from './Loader';
import { ToggleInput } from './ui/ToggleInput';
import { SelectInput } from './ui/SelectInput';
import { LabeledInput } from './ui/LabeledInput';

// New Reusable Component for Model Selection with "Other" option
// Giữ lại component này vì nó có logic đặc thù (custom input) chưa có trong shared UI
const ModelSelectorWithCustom: React.FC<{
    label: string;
    description?: string;
    value: string;
    onChange: (val: string) => void;
    options?: { id: string; name: string }[];
}> = ({ label, description, value, onChange, options = MODEL_OPTIONS }) => {
    const isKnownOption = useMemo(() => {
        return options.some(opt => opt.id === value);
    }, [value, options]);

    const showInput = !isKnownOption;

    return (
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <label className="block text-sm font-bold text-indigo-300 mb-1">{label}</label>
            {description && <p className="text-xs text-slate-500 mb-2">{description}</p>}
            
            <select
                value={isKnownOption ? value : 'custom_option'}
                onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom_option') {
                        onChange(''); 
                    } else {
                        onChange(val);
                    }
                }}
                className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white mb-2"
            >
                {options.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value="custom_option">Khác (Tự nhập Model ID)</option>
            </select>

            {showInput && (
                <div className="animate-fade-in-up">
                    <input
                        type="text"
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-500 rounded p-2 text-white font-mono text-sm focus:ring-1 focus:ring-indigo-500"
                        placeholder="Nhập Model ID (ví dụ: gemini-exp-1121, gpt-4o)..."
                        autoFocus
                    />
                </div>
            )}
        </div>
    );
};

export const ApiSettings: React.FC = () => {
    // Global Connection State
    const [connection, setConnection] = useState<GlobalConnectionSettings>(getConnectionSettings());
    
    // Gemini Settings
    const [useDefaultKey, setUseDefaultKey] = useState(true);
    const [geminiApiKeys, setGeminiApiKeys] = useState('');
    
    // OpenRouter Settings
    const [openRouterApiKey, setOpenRouterApiKey] = useState('');
    const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
    const [isFetchingORModels, setIsFetchingORModels] = useState(false);
    const [orModelError, setOrModelError] = useState<string | null>(null);
    const [showFreeOR, setShowFreeOR] = useState(false);

    // Proxy Settings
    const [proxyUrl, setProxyUrl] = useState('');
    const [proxyPassword, setProxyPassword] = useState('');
    const [proxyLegacyMode, setProxyLegacyMode] = useState(true);
    const [proxyForTools, setProxyForTools] = useState(false);
    const [isPingingProxy, setIsPingingProxy] = useState(false);
    const [proxyPingStatus, setProxyPingStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [proxyErrorMessage, setProxyErrorMessage] = useState('');

    // UI State
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [isValidatingOR, setIsValidatingOR] = useState(false);
    const [orValidationStatus, setOrValidationStatus] = useState<'idle' | 'success' | 'error'>('idle');

    // Load Initial Data
    useEffect(() => {
        const apiSettings = getApiSettings();
        setUseDefaultKey(apiSettings.useDefault);
        setGeminiApiKeys(apiSettings.keys.join('\n'));
        
        setOpenRouterApiKey(getOpenRouterApiKey());
        
        setProxyUrl(getProxyUrl());
        setProxyPassword(getProxyPassword());
        setProxyLegacyMode(getProxyLegacyMode());
        setProxyForTools(getProxyForTools());
        
        setConnection(getConnectionSettings());
    }, []);

    // Helper to update connection state
    const updateConnection = (key: keyof GlobalConnectionSettings, value: any) => {
        setConnection(prev => ({ ...prev, [key]: value }));
    };

    // Save All Logic
    const handleSave = () => {
        try {
            // 1. Save Global Connection
            saveConnectionSettings(connection);

            // 2. Save Gemini Keys
            const keys = geminiApiKeys.split('\n').map(k => k.trim()).filter(Boolean);
            saveApiSettings({ useDefault: useDefaultKey, keys });

            // 3. Save OpenRouter
            saveOpenRouterApiKey(openRouterApiKey);

            // 4. Save Proxy
            saveProxyUrl(proxyUrl);
            saveProxyPassword(proxyPassword);
            saveProxyLegacyMode(proxyLegacyMode);
            saveProxyForTools(proxyForTools);

            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (e) {
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    // OpenRouter Logic
    const handleValidateORKey = async () => {
        if (!openRouterApiKey) return;
        setIsValidatingOR(true);
        setOrValidationStatus('idle');
        try {
            await validateOpenRouterKey(openRouterApiKey);
            setOrValidationStatus('success');
            // Auto fetch models on success
            if (openRouterModels.length === 0) fetchOpenRouterModels();
        } catch (error) {
            setOrValidationStatus('error');
        } finally {
            setIsValidatingOR(false);
        }
    };

    const fetchOpenRouterModels = async () => {
        setIsFetchingORModels(true);
        setOrModelError(null);
        try {
            const models = await getOpenRouterModels();
            setOpenRouterModels(models);
        } catch (e) {
            setOrModelError(e instanceof Error ? e.message : 'Error loading models');
        } finally {
            setIsFetchingORModels(false);
        }
    };

    const filteredORModels = useMemo(() => {
        if (!showFreeOR) return openRouterModels;
        return openRouterModels.filter(m => m.pricing.prompt === '0' && m.pricing.completion === '0');
    }, [openRouterModels, showFreeOR]);

    // Proxy Ping Logic
    const handlePingProxy = async () => {
        if (!proxyUrl) return;
        setIsPingingProxy(true);
        setProxyPingStatus('idle');
        setProxyErrorMessage('');
        
        try {
            const cleanUrl = proxyUrl.trim().replace(/\/$/, '');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); 
            
            const reqOptions: RequestInit = {
                method: 'GET',
                signal: controller.signal,
            };

            // Basic headers
            const headers: Record<string, string> = {};
            if (!proxyLegacyMode) {
                headers['Content-Type'] = 'application/json';
                if (proxyPassword) {
                    headers['Authorization'] = `Bearer ${proxyPassword}`;
                }
            }
            reqOptions.headers = headers;
            if (proxyLegacyMode) reqOptions.mode = 'no-cors';

            // Try pinging a standard endpoint
            await fetch(`${cleanUrl}/v1/models`, reqOptions);
            
            clearTimeout(timeoutId);
            setProxyPingStatus('success');
        } catch (error: any) {
            if (error.name === 'AbortError') {
                setProxyErrorMessage("Timeout.");
            } else if (error.message.includes('Failed to fetch')) {
                setProxyErrorMessage("Lỗi kết nối / CORS.");
            } else {
                setProxyErrorMessage(error.message);
            }
            setProxyPingStatus('error');
        } finally {
            setIsPingingProxy(false);
        }
    };

    // --- RENDER ---

    const renderSourceTab = (source: CompletionSource, label: string) => (
        <button
            onClick={() => updateConnection('source', source)}
            className={`flex-1 py-3 px-4 text-sm font-bold rounded-lg transition-all border-2 ${
                connection.source === source
                    ? 'bg-sky-600/20 border-sky-500 text-sky-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="bg-slate-800/50 p-6 rounded-xl shadow-lg max-w-3xl mx-auto space-y-8">
            {/* 1. SOURCE SELECTOR */}
            <div>
                <h3 className="text-xl font-bold text-sky-400 mb-4">1. Chọn Nguồn Kết Nối (API Source)</h3>
                <div className="flex gap-4 flex-col sm:flex-row">
                    {renderSourceTab('gemini', 'Google Gemini')}
                    {renderSourceTab('openrouter', 'OpenRouter')}
                    {renderSourceTab('proxy', 'Reverse Proxy')}
                </div>
                <p className="text-xs text-slate-400 mt-2 italic">
                    Nguồn được chọn sẽ được sử dụng cho tất cả các cuộc trò chuyện.
                </p>
            </div>

            <div className="border-t border-slate-700"></div>

            {/* 2. CONFIGURATION AREA */}
            <div>
                <h3 className="text-xl font-bold text-sky-400 mb-4">2. Cấu hình Chi tiết & Model</h3>
                
                {/* GEMINI CONFIG */}
                {connection.source === 'gemini' && (
                    <div className="space-y-6 animate-fade-in-up">
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <label className="block text-sm font-bold text-indigo-300 mb-2">Mô hình Chính (Chat)</label>
                            <SelectInput
                                value={connection.gemini_model}
                                onChange={(e) => updateConnection('gemini_model', e.target.value)}
                                options={MODEL_OPTIONS.map(m => ({ value: m.id, label: m.name }))}
                            />
                        </div>

                        <div>
                            <h4 className="font-bold text-slate-300 mb-3">API Key (Gemini)</h4>
                            <div className="space-y-4 pl-2 border-l-2 border-slate-700">
                                <ToggleInput 
                                    label="Sử dụng API Key Mặc định (Environment)"
                                    checked={useDefaultKey}
                                    onChange={setUseDefaultKey}
                                />
                                {!useDefaultKey && (
                                    <textarea
                                        value={geminiApiKeys}
                                        onChange={e => setGeminiApiKeys(e.target.value)}
                                        rows={3}
                                        className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 font-mono text-xs"
                                        placeholder="Nhập API Key cá nhân (Mỗi dòng 1 key)..."
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* OPENROUTER CONFIG */}
                {connection.source === 'openrouter' && (
                    <div className="space-y-6 animate-fade-in-up">
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <label className="block text-sm font-bold text-indigo-300 mb-2">Mô hình OpenRouter</label>
                            {isFetchingORModels ? <Loader message="Đang tải danh sách..." /> : (
                                <div className="flex gap-2">
                                    <div className="flex-grow">
                                        <SelectInput 
                                            options={filteredORModels.map(m => ({ value: m.id, label: `${m.name} (${m.pricing.prompt === '0' ? 'Free' : '$'})` }))}
                                            value={connection.openrouter_model}
                                            onChange={(e) => updateConnection('openrouter_model', e.target.value)}
                                            placeholder="Chọn mô hình..."
                                        />
                                    </div>
                                    <button onClick={fetchOpenRouterModels} className="px-3 bg-slate-700 rounded hover:bg-slate-600 text-slate-300" title="Tải lại danh sách">↻</button>
                                </div>
                            )}
                            <div className="mt-2">
                                <ToggleInput label="Chỉ hiện model miễn phí" checked={showFreeOR} onChange={setShowFreeOR} />
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold text-slate-300 mb-3">API Key (OpenRouter)</h4>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={openRouterApiKey}
                                    onChange={e => setOpenRouterApiKey(e.target.value)}
                                    className="flex-grow bg-slate-700 border border-slate-600 rounded-md p-2 text-white"
                                    placeholder="sk-or-..."
                                />
                                <button onClick={handleValidateORKey} disabled={isValidatingOR} className="px-4 bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:bg-slate-600">
                                    {isValidatingOR ? '...' : 'Check'}
                                </button>
                            </div>
                            {orValidationStatus === 'success' && <p className="text-xs text-green-400 mt-1">Key hợp lệ.</p>}
                            {orValidationStatus === 'error' && <p className="text-xs text-red-400 mt-1">Key không hợp lệ.</p>}
                        </div>
                    </div>
                )}

                {/* PROXY CONFIG */}
                {connection.source === 'proxy' && (
                    <div className="space-y-6 animate-fade-in-up">
                        
                        {/* Protocol Selection */}
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <label className="block text-sm font-bold text-sky-400 mb-3">Giao thức Proxy (Protocol)</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <button
                                    onClick={() => updateConnection('proxy_protocol', 'openai')}
                                    className={`p-3 rounded-lg border text-sm flex items-center justify-center gap-2 transition-colors ${
                                        connection.proxy_protocol !== 'google_native' // Default/Fallback to OpenAI
                                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' 
                                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    <span>🌐</span> Chuẩn OpenAI (Mặc định)
                                </button>
                                <button
                                    onClick={() => updateConnection('proxy_protocol', 'google_native')}
                                    className={`p-3 rounded-lg border text-sm flex items-center justify-center gap-2 transition-colors ${
                                        connection.proxy_protocol === 'google_native'
                                        ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    <span>⚡</span> Google Native (Browser Proxy)
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 italic">
                                * Chọn "Google Native" nếu bạn dùng Browser Proxy để gọi trực tiếp endpoint của Google Gemini.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {/* Chat Model Selector - Uses PROXY_MODEL_OPTIONS */}
                            <ModelSelectorWithCustom
                                label="Chat Model ID (Mô hình Trò chuyện)"
                                description="Model dùng cho tương tác chính. Nên dùng model thông minh (Pro)."
                                value={connection.proxy_model}
                                onChange={(val) => updateConnection('proxy_model', val)}
                                options={PROXY_MODEL_OPTIONS}
                            />

                            {/* Tool Model Selector - Uses PROXY_MODEL_OPTIONS */}
                            <ModelSelectorWithCustom
                                label="Tool Model ID (Tác vụ phụ)"
                                description="Model dùng cho Smart Scan, Tóm tắt, Dịch. Nên dùng model nhanh (Flash/Flash-Lite)."
                                value={connection.proxy_tool_model}
                                onChange={(val) => updateConnection('proxy_tool_model', val)}
                                options={PROXY_MODEL_OPTIONS}
                            />
                        </div>

                        <div className="space-y-4 border-t border-slate-700 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Proxy URL</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={proxyUrl}
                                        onChange={e => setProxyUrl(e.target.value)}
                                        className="flex-grow bg-slate-700 border border-slate-600 rounded-md p-2 text-white font-mono text-sm"
                                        placeholder="http://127.0.0.1:8889"
                                    />
                                    <button onClick={handlePingProxy} disabled={isPingingProxy} className="px-4 bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:bg-slate-600">
                                        Ping
                                    </button>
                                </div>
                                {proxyPingStatus === 'success' && <p className="text-xs text-green-400 mt-1">Kết nối OK.</p>}
                                {proxyPingStatus === 'error' && <p className="text-xs text-red-400 mt-1">Lỗi: {proxyErrorMessage}</p>}
                            </div>

                            <LabeledInput 
                                label="Password / Key (Optional)"
                                value={proxyPassword}
                                onChange={e => setProxyPassword(e.target.value)}
                                type="password"
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <ToggleInput label="Legacy Mode (Kingfall)" checked={proxyLegacyMode} onChange={setProxyLegacyMode} />
                                    <p className="text-xs text-slate-500 mt-1">Dùng text/plain để tránh CORS trên localhost cũ.</p>
                                </div>
                                <div>
                                    <ToggleInput label="Dùng Proxy cho Tools" checked={proxyForTools} onChange={setProxyForTools} />
                                    <p className="text-xs text-slate-500 mt-1">Bắt buộc Quét/Dịch chạy qua Proxy này.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* SAVE BUTTON */}
            <div className="flex justify-end items-center gap-4 pt-4 border-t border-slate-700 sticky bottom-0 bg-slate-800/90 p-2 backdrop-blur-sm rounded-b-xl">
                {saveStatus === 'saved' && <span className="text-sm text-green-400 font-bold animate-pulse">Đã lưu thành công!</span>}
                {saveStatus === 'error' && <span className="text-sm text-red-400 font-bold">Lỗi khi lưu!</span>}
                <button
                    onClick={handleSave}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-8 rounded-lg transition-transform active:scale-95 shadow-lg shadow-sky-900/30"
                >
                    Áp Dụng Cài Đặt
                </button>
            </div>
        </div>
    );
};

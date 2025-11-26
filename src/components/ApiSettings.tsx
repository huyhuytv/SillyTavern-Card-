import React, { useState, useEffect } from 'react';
import { getActiveModel, setActiveModel, MODEL_OPTIONS, getApiSettings, saveApiSettings, getOpenRouterApiKey, saveOpenRouterApiKey } from '../services/settingsService';
import { validateOpenRouterKey } from '../services/geminiService';
import { Loader } from './Loader';

const ToggleInput: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; description?: string }> = ({ label, checked, onChange, description }) => (
    <div>
        <div className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg">
            <label className="text-sm font-medium text-slate-300">{label}</label>
            <button
                type="button"
                onClick={() => onChange(!checked)}
                className={`${
                    checked ? 'bg-sky-500' : 'bg-slate-600'
                } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800`}
                role="switch"
                aria-checked={checked}
            >
                <span
                    aria-hidden="true"
                    className={`${
                        checked ? 'translate-x-5' : 'translate-x-0'
                    } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                />
            </button>
        </div>
        {description && <p className="text-xs text-slate-500 mt-2">{description}</p>}
    </div>
);

export const ApiSettings: React.FC = () => {
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [useDefaultKey, setUseDefaultKey] = useState(true);
    const [geminiApiKeys, setGeminiApiKeys] = useState('');
    const [openRouterApiKey, setOpenRouterApiKey] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

    const [isValidating, setIsValidating] = useState(false);
    const [validationStatus, setValidationStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [validationError, setValidationError] = useState('');

    useEffect(() => {
        const settings = getApiSettings();
        setSelectedModel(getActiveModel());
        setUseDefaultKey(settings.useDefault);
        setGeminiApiKeys(settings.keys.join('\n'));
        setOpenRouterApiKey(getOpenRouterApiKey());
    }, []);

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newModel = e.target.value;
        setActiveModel(newModel);
        setSelectedModel(newModel);
    };

    const handleSave = () => {
        try {
            const keys = geminiApiKeys.split('\n').map(k => k.trim()).filter(Boolean);
            saveApiSettings({ useDefault: useDefaultKey, keys });
            saveOpenRouterApiKey(openRouterApiKey);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (e) {
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };
    
    const handleValidateKey = async () => {
        if (!openRouterApiKey) return;
        setIsValidating(true);
        setValidationStatus('idle');
        setValidationError('');
        try {
            await validateOpenRouterKey(openRouterApiKey);
            setValidationStatus('success');
        } catch (error) {
            setValidationStatus('error');
            setValidationError(error instanceof Error ? error.message : 'Lỗi không xác định');
        } finally {
            setIsValidating(false);
        }
    };


    return (
        <div className="bg-slate-800/50 p-6 rounded-xl shadow-lg max-w-2xl mx-auto space-y-8">
            <div>
                <h3 className="text-xl font-bold text-sky-400 mb-6">Cài đặt Gemini API</h3>
                <div className="space-y-6">
                    <div>
                        <ToggleInput 
                            label="Sử dụng API Key Mặc định"
                            checked={useDefaultKey}
                            onChange={setUseDefaultKey}
                            description={useDefaultKey ? "Sử dụng API key do môi trường ứng dụng cung cấp." : "Sử dụng API key cá nhân của bạn bên dưới."}
                        />
                    </div>

                    {!useDefaultKey && (
                         <div>
                            <label htmlFor="api-keys-textarea" className="block text-sm font-medium text-slate-300 mb-1">
                                API Key Cá nhân (Một key mỗi dòng)
                            </label>
                            <textarea
                                id="api-keys-textarea"
                                value={geminiApiKeys}
                                onChange={e => setGeminiApiKeys(e.target.value)}
                                rows={5}
                                className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                                placeholder="Nhập một hoặc nhiều API key tại đây..."
                            />
                            <p className="text-xs text-slate-500 mt-2">
                               Nếu bạn cung cấp nhiều key, ứng dụng sẽ tự động xoay vòng chúng để phân phối yêu cầu.
                            </p>
                        </div>
                    )}

                    <div>
                        <label htmlFor="model-select" className="block text-sm font-medium text-slate-300 mb-1">
                            Chọn Mô hình Gemini
                        </label>
                        <select
                            id="model-select"
                            value={selectedModel}
                            onChange={handleModelChange}
                            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500"
                        >
                            {MODEL_OPTIONS.map(model => (
                                <option key={model.id} value={model.id}>
                                    {model.name}
                                </option>
                            ))}
                        </select>
                         <p className="text-xs text-slate-500 mt-2">
                            Mô hình được chọn sẽ được sử dụng cho các tính năng phân tích và khi preset được đặt thành Custom/Gemini.
                        </p>
                    </div>
                </div>
            </div>

            <div className="border-t border-slate-700"></div>
            
            <div>
                 <h3 className="text-xl font-bold text-sky-400 mb-6">Cài đặt OpenRouter API</h3>
                 <div className="space-y-6">
                    <div>
                        <label htmlFor="openrouter-api-key" className="block text-sm font-medium text-slate-300 mb-1">
                            API Key của OpenRouter
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                id="openrouter-api-key"
                                type="password"
                                value={openRouterApiKey}
                                onChange={e => {
                                    setOpenRouterApiKey(e.target.value);
                                    setValidationStatus('idle'); // Reset validation status on change
                                }}
                                className="flex-grow bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                                placeholder="sk-or-..."
                            />
                            <button
                                onClick={handleValidateKey}
                                disabled={isValidating || !openRouterApiKey}
                                className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                            >
                                {isValidating ? <Loader message="" /> : 'Kiểm tra'}
                            </button>
                             {validationStatus === 'success' && (
                                <div className="flex items-center gap-1 text-green-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span className="text-sm font-medium">Hợp lệ</span>
                                </div>
                            )}
                            {validationStatus === 'error' && (
                                <div className="flex items-center gap-1 text-red-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span className="text-sm font-medium">Không hợp lệ</span>
                                </div>
                            )}
                        </div>
                        {validationError && (
                            <p className="text-xs text-red-400 mt-2">{validationError}</p>
                        )}
                         <p className="text-xs text-slate-500 mt-2">
                           API key của bạn để sử dụng các mô hình từ OpenRouter.ai.
                        </p>
                    </div>
                 </div>
            </div>
            
            <div className="flex justify-end items-center gap-4 pt-4 border-t border-slate-700">
                {saveStatus === 'saved' && <span className="text-sm text-green-400">Đã lưu!</span>}
                {saveStatus === 'error' && <span className="text-sm text-red-400">Lỗi khi lưu.</span>}
                <button
                    onClick={handleSave}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                    Lưu Tất cả Cài đặt
                </button>
            </div>
        </div>
    );
};
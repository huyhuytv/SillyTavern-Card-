
import React, { useId, useState, useEffect } from 'react';
import type { SillyTavernPreset } from '../types';
import { Tooltip } from './Tooltip';
import { AVAILABLE_VOICES, playTextToSpeech, playNativeTts, getVietnameseVoices } from '../services/ttsService';
import { useToast } from './ToastSystem';

interface TtsSettingsProps {
    preset: SillyTavernPreset;
    onUpdate: (updatedPreset: SillyTavernPreset) => void;
}

const ToggleInput: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; tooltipText?: string }> = ({ label, checked, onChange, tooltipText }) => {
    return (
        <div className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg">
            <Tooltip text={tooltipText}>
                <label className="text-sm font-medium text-slate-300 cursor-help">{label}</label>
            </Tooltip>
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
    );
};

const SelectInput: React.FC<{ label: string; value: string; onChange: (value: string) => void; options: { id: string; name: string }[]; tooltipText?: string }> = ({ label, value, onChange, options, tooltipText }) => {
    const id = useId();
    return (
    <div>
        <Tooltip text={tooltipText || ''}>
            <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1 cursor-help">{label}</label>
        </Tooltip>
        <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
        >
            {options.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
        </select>
    </div>
)};

const SliderInput: React.FC<{ label: string; value: number; onChange: (value: number) => void; min: number; max: number; step: number; tooltipText?: string }> = ({ label, value, onChange, min, max, step, tooltipText }) => {
    const id = useId();
    return (
    <div>
        <Tooltip text={tooltipText || ''}>
            <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1 cursor-help">{label}</label>
        </Tooltip>
        <div className="flex items-center gap-4">
            <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
            <span className="w-12 text-right font-mono text-sm text-slate-200">{value}</span>
        </div>
    </div>
)};

export const TtsSettings: React.FC<TtsSettingsProps> = ({ preset, onUpdate }) => {
    const { showToast } = useToast();
    const [isTesting, setIsTesting] = useState(false);
    const [nativeVoices, setNativeVoices] = useState<SpeechSynthesisVoice[]>([]);
    
    // Load native voices on mount
    useEffect(() => {
        const loadVoices = () => {
            const voices = getVietnameseVoices();
            setNativeVoices(voices);
        };
        
        loadVoices();
        
        // Browsers load voices asynchronously
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, []);

    const handleUpdate = (key: keyof SillyTavernPreset, value: any) => {
        onUpdate({ ...preset, [key]: value });
    };

    const handleTestVoice = async () => {
        if (isTesting) return;
        setIsTesting(true);
        try {
            const text = "Xin chào, đây là giọng đọc thử nghiệm. Hệ thống âm thanh đang hoạt động tốt.";
            const provider = preset.tts_provider || 'gemini';

            if (provider === 'gemini') {
                const voice = preset.tts_voice || 'Kore';
                await playTextToSpeech(text, voice);
            } else {
                const voiceUri = preset.tts_native_voice || '';
                const rate = preset.tts_rate || 1;
                const pitch = preset.tts_pitch || 1;
                
                // Wrap native play in promise for test button state logic
                await new Promise<void>((resolve) => {
                    playNativeTts(text, voiceUri, rate, pitch, undefined, () => resolve());
                });
            }
            showToast("Đã phát âm thanh thử nghiệm thành công.", "success");
        } catch (e) {
            showToast(`Lỗi thử nghiệm: ${e instanceof Error ? e.message : String(e)}`, "error");
        } finally {
            setIsTesting(false);
        }
    };

    const isNative = preset.tts_provider === 'native';

    return (
        <div className="space-y-6">
            <div className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-lg mb-4 flex gap-3">
                <div className="text-2xl">🔊</div>
                <div>
                    <h4 className="font-bold text-amber-300 mb-1">Hệ thống Giọng nói (TTS)</h4>
                    <p className="text-sm text-slate-300">
                        Chuyển đổi văn bản thành giọng nói. Hỗ trợ Gemini AI (Cloud - Chất lượng cao) và Trình duyệt (Native - Offline/Nhanh).
                    </p>
                </div>
            </div>

            <ToggleInput 
                label="Bật Text-to-Speech (TTS)"
                checked={preset.tts_enabled ?? false}
                onChange={(v) => handleUpdate('tts_enabled', v)}
                tooltipText="Hiển thị nút phát âm thanh trên tin nhắn và cho phép nhân vật đọc thoại."
            />

            <div className={`space-y-6 transition-opacity duration-300 ${!preset.tts_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                
                <ToggleInput
                    label="Chế độ Đọc Streaming (Real-time)"
                    checked={preset.tts_streaming ?? false}
                    onChange={(v) => handleUpdate('tts_streaming', v)}
                    tooltipText="Đọc từng câu ngay khi xuất hiện thay vì đợi toàn bộ câu trả lời. Yêu cầu bật 'Stream Response'."
                />

                <SelectInput 
                    label="Nguồn Giọng Đọc (TTS Provider)"
                    value={preset.tts_provider || 'gemini'}
                    onChange={(v) => handleUpdate('tts_provider', v)}
                    options={[
                        { id: 'gemini', name: 'Gemini AI (Yêu cầu API Key)' },
                        { id: 'native', name: 'Trình duyệt (Native/Offline)' }
                    ]}
                    tooltipText="Gemini: Giọng hay, tốn phí/quota. Native: Giọng máy, miễn phí, không độ trễ."
                />

                {isNative ? (
                    <div className="space-y-4 border-l-2 border-slate-600 pl-4">
                        {nativeVoices.length === 0 ? (
                            <p className="text-xs text-amber-400">Không tìm thấy giọng Tiếng Việt trong trình duyệt của bạn. Vui lòng kiểm tra cài đặt ngôn ngữ hệ điều hành.</p>
                        ) : (
                            <SelectInput 
                                label="Giọng Đọc Trình Duyệt (Chỉ Tiếng Việt)"
                                value={preset.tts_native_voice || (nativeVoices[0]?.voiceURI || '')}
                                onChange={(v) => handleUpdate('tts_native_voice', v)}
                                options={nativeVoices.map(v => ({ id: v.voiceURI, name: v.name }))}
                                tooltipText="Danh sách giọng nói Tiếng Việt có sẵn trong máy của bạn."
                            />
                        )}
                        <SliderInput 
                            label="Tốc độ (Rate)"
                            value={preset.tts_rate ?? 1}
                            onChange={(v) => handleUpdate('tts_rate', v)}
                            min={0.1} max={2} step={0.1}
                            tooltipText="Tốc độ đọc. 1.0 là bình thường."
                        />
                        <SliderInput 
                            label="Cao độ (Pitch)"
                            value={preset.tts_pitch ?? 1}
                            onChange={(v) => handleUpdate('tts_pitch', v)}
                            min={0} max={2} step={0.1}
                            tooltipText="Độ cao thấp của giọng. 1.0 là bình thường."
                        />
                    </div>
                ) : (
                    <div className="space-y-4 border-l-2 border-slate-600 pl-4">
                        <SelectInput 
                            label="Giọng đọc Gemini"
                            value={preset.tts_voice || 'Kore'}
                            onChange={(v) => handleUpdate('tts_voice', v)}
                            options={AVAILABLE_VOICES}
                            tooltipText="Chọn chất giọng AI. Lưu ý: Gemini hiện tại chưa hỗ trợ chỉnh tốc độ/cao độ."
                        />
                    </div>
                )}

                <div className="flex justify-end pt-2">
                    <button
                        onClick={handleTestVoice}
                        disabled={isTesting}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-md transition-colors flex items-center gap-2 disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        {isTesting ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                <span>Đang tải...</span>
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                                <span>Nghe thử giọng này</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

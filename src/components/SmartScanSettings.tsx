
import React, { useState, useEffect } from 'react';
import { 
    MODEL_OPTIONS, 
    getGlobalSmartScanSettings, 
    saveGlobalSmartScanSettings, 
    DEFAULT_SMART_SCAN_SETTINGS, 
    GlobalSmartScanSettings
} from '../services/settingsService';
import { SelectInput } from './ui/SelectInput';
import { SliderInput } from './ui/SliderInput';
import { LabeledTextarea } from './ui/LabeledTextarea';
import { ToggleInput } from './ui/ToggleInput';
import { useToast } from './ToastSystem';

export const SmartScanSettings: React.FC = () => {
    const [settings, setSettings] = useState<GlobalSmartScanSettings>(DEFAULT_SMART_SCAN_SETTINGS);
    const [showPromptEditor, setShowPromptEditor] = useState(false);
    const { showToast } = useToast();

    // Load initial settings on mount
    useEffect(() => {
        const loaded = getGlobalSmartScanSettings();
        setSettings(loaded);
    }, []);

    const handleUpdate = (key: keyof GlobalSmartScanSettings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        saveGlobalSmartScanSettings(newSettings);
    };

    const resetToDefault = () => {
        if(window.confirm('Bạn có chắc muốn khôi phục toàn bộ cấu hình quét về mặc định?')) {
            setSettings(DEFAULT_SMART_SCAN_SETTINGS);
            saveGlobalSmartScanSettings(DEFAULT_SMART_SCAN_SETTINGS);
            showToast('Đã khôi phục cấu hình mặc định.', 'info');
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-lg mb-4 flex justify-between items-start">
                <div>
                    <h4 className="font-bold text-indigo-300 mb-2 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        Smart Scan Toàn Cục (Global)
                    </h4>
                    <p className="text-sm text-slate-300">
                        Cấu hình này áp dụng cho <strong>TẤT CẢ</strong> Preset và Nhân vật. Nó hoạt động độc lập với Preset đang chọn.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ToggleInput 
                        label="Bật Smart Scan" 
                        checked={settings.enabled} 
                        onChange={(v) => handleUpdate('enabled', v)} 
                        clean
                    />
                </div>
            </div>

            <div className={`space-y-6 transition-opacity duration-300 ${!settings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <SelectInput 
                    label="Chế độ Quét (Scan Mode)"
                    value={settings.mode}
                    onChange={(e) => handleUpdate('mode', e.target.value)}
                    options={[
                        { value: 'keyword', label: '1. Quét Thủ công (Keyword Only)' },
                        { value: 'hybrid', label: '2. Kết hợp (Manual + AI)' },
                        { value: 'ai_only', label: '3. AI Toàn Quyền (AI Only)' }
                    ]}
                    tooltip={
                        settings.mode === 'keyword' ? "Chỉ kích hoạt các mục khớp chính xác từ khóa/Regex được định nghĩa trong thẻ." :
                        settings.mode === 'hybrid' ? "Kích hoạt bằng từ khóa VÀ bổ sung thêm các mục liên quan theo ngữ cảnh do AI phát hiện." :
                        "Bỏ qua từ khóa và thời gian hồi chiêu (Cooldown). AI sẽ tự quyết định toàn bộ các mục cần thiết dựa trên ngữ cảnh."
                    }
                />

                <div className={`space-y-6 transition-opacity duration-300 ${settings.mode === 'keyword' ? 'opacity-50 pointer-events-none' : ''}`}>
                    
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 space-y-4">
                        <SelectInput 
                            label="Chiến lược Nội dung (Content Strategy)"
                            value={settings.scan_strategy || 'efficient'}
                            onChange={(e) => handleUpdate('scan_strategy', e.target.value)}
                            options={[
                                { value: 'efficient', label: '⚡ Tối ưu hóa (Cắt ngắn > 400 ký tự)' },
                                { value: 'full', label: '🧠 Chính xác cao (Gửi toàn bộ nội dung)' }
                            ]}
                            tooltip="Tối ưu: Giúp tiết kiệm Token và tốc độ. Chính xác cao: Giúp AI hiểu sâu hơn nhưng tốn nhiều Token hơn (Khuyên dùng với model Flash)."
                        />

                        <SelectInput 
                            label="Mô hình Quét (Khuyên dùng Flash)"
                            value={settings.model || 'gemini-2.5-flash'}
                            onChange={(e) => handleUpdate('model', e.target.value)}
                            options={MODEL_OPTIONS.map(opt => ({ value: opt.id, label: opt.name }))}
                            tooltip="Chọn mô hình AI để thực hiện việc quét. Gemini Flash nhanh và rẻ, phù hợp nhất cho tác vụ này."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <SliderInput
                            label="Độ sâu Quét (Tin nhắn)"
                            value={settings.depth || 3}
                            onChange={(v) => handleUpdate('depth', v)}
                            min={1}
                            max={10}
                            step={1}
                            tooltip="Số lượng tin nhắn gần nhất trong lịch sử trò chuyện sẽ được gửi cho AI để phân tích ngữ cảnh."
                        />

                        <SliderInput
                            label="Ngân sách Mục (Max Entries)"
                            value={settings.max_entries || 5}
                            onChange={(v) => handleUpdate('max_entries', v)}
                            min={1}
                            max={50}
                            step={1}
                            tooltip="Số lượng mục World Info tối đa mà AI được phép kích hoạt thêm trong mỗi lượt."
                        />
                    </div>

                    <div className="bg-emerald-900/20 border border-emerald-500/30 p-4 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-emerald-400 font-bold text-sm uppercase tracking-wide">AI Persistence</span>
                        </div>
                        <SliderInput
                            label="AI Sticky Duration (Duy trì Cưỡng chế)"
                            value={settings.aiStickyDuration}
                            onChange={(v) => handleUpdate('aiStickyDuration', v)}
                            min={0}
                            max={20}
                            step={1}
                            tooltip="Khi AI kích hoạt một mục, mục đó sẽ duy trì ít nhất bao nhiêu lượt. Logic: Max(Card_Sticky, Global_Sticky)."
                        />
                    </div>

                    {/* Prompt Editor Section */}
                    <div className="border-t border-slate-700 pt-4">
                        <button 
                            onClick={() => setShowPromptEditor(!showPromptEditor)}
                            className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-2 font-semibold"
                        >
                            <span aria-hidden="true">{showPromptEditor ? '▼' : '▶'}</span>
                            Chỉnh sửa Lời nhắc Quét (System Prompt)
                        </button>
                        
                        {showPromptEditor && (
                            <div className="mt-4 space-y-4 animate-fade-in-up">
                                <div className="bg-slate-900/50 p-3 rounded border border-slate-700 text-xs text-slate-400">
                                    <p className="font-bold mb-1 text-slate-300">Các biến hỗ trợ (Macros):</p>
                                    <ul className="list-disc list-inside space-y-1 pl-2">
                                        <li><code>{'{{context}}'}</code>: Kiến thức nền tảng (Hằng số).</li>
                                        <li><code>{'{{state}}'}</code>: Trạng thái hiện tại (Biến số & Chỉ số).</li>
                                        <li><code>{'{{history}}'}</code>: Lịch sử hội thoại gần nhất.</li>
                                        <li><code>{'{{input}}'}</code>: Hành động/Lời nói mới nhất của người dùng.</li>
                                        <li><code>{'{{candidates}}'}</code>: Danh sách các mục World Info để AI lựa chọn.</li>
                                    </ul>
                                </div>
                                
                                <LabeledTextarea 
                                    label="Nội dung Prompt"
                                    value={settings.system_prompt || ''}
                                    onChange={(e) => handleUpdate('system_prompt', e.target.value)}
                                    rows={15}
                                    tooltip="Tùy chỉnh cách AI suy nghĩ và lựa chọn thông tin. Đảm bảo giữ lại định dạng Output JSON."
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t border-slate-700 flex justify-end">
                <button 
                    onClick={resetToDefault}
                    className="text-xs text-red-400 hover:text-red-300 underline"
                >
                    Khôi phục cấu hình mặc định
                </button>
            </div>
        </div>
    );
};


import React, { useState } from 'react';
import type { SillyTavernPreset } from '../types';
import { MODEL_OPTIONS } from '../services/settingsService';
import defaultPreset from '../data/defaultPreset';
import { SelectInput } from './ui/SelectInput';
import { SliderInput } from './ui/SliderInput';
import { LabeledTextarea } from './ui/LabeledTextarea';

interface SmartScanSettingsProps {
    preset: SillyTavernPreset;
    onUpdate: (updatedPreset: SillyTavernPreset) => void;
}

export const SmartScanSettings: React.FC<SmartScanSettingsProps> = ({ preset, onUpdate }) => {
    const [showPromptEditor, setShowPromptEditor] = useState(false);
    
    const handleUpdate = (key: keyof SillyTavernPreset, value: any) => {
        onUpdate({ ...preset, [key]: value });
    };

    const resetPrompt = () => {
        if(window.confirm('Bạn có chắc muốn khôi phục lời nhắc quét về mặc định?')) {
            handleUpdate('smart_scan_system_prompt', defaultPreset.smart_scan_system_prompt);
        }
    };

    // Determine current mode, defaulting to 'keyword' if not set
    // Also support legacy 'smart_scan_enabled' boolean for migration
    const currentMode = preset.smart_scan_mode || (preset.smart_scan_enabled ? 'hybrid' : 'keyword');

    return (
        <div className="space-y-6">
            <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-lg mb-4">
                <h4 className="font-bold text-indigo-300 mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    Smart Scan (Quét Thông Minh)
                </h4>
                <p className="text-sm text-slate-300">
                    Cấu hình cách hệ thống tìm kiếm và kích hoạt các mục World Info (Sổ tay Thế giới).
                </p>
            </div>

            <SelectInput 
                label="Chế độ Quét (Scan Mode)"
                value={currentMode}
                onChange={(e) => handleUpdate('smart_scan_mode', e.target.value)}
                options={[
                    { value: 'keyword', label: '1. Quét Thủ công (Keyword Only)' },
                    { value: 'hybrid', label: '2. Kết hợp (Manual + AI)' },
                    { value: 'ai_only', label: '3. AI Toàn Quyền (AI Only)' }
                ]}
                tooltip={
                    currentMode === 'keyword' ? "Chỉ kích hoạt các mục khớp chính xác từ khóa/Regex được định nghĩa trong thẻ." :
                    currentMode === 'hybrid' ? "Kích hoạt bằng từ khóa VÀ bổ sung thêm các mục liên quan theo ngữ cảnh do AI phát hiện." :
                    "Bỏ qua từ khóa và thời gian hồi chiêu (Cooldown). AI sẽ tự quyết định toàn bộ các mục cần thiết dựa trên ngữ cảnh."
                }
            />

            <div className={`space-y-6 transition-opacity duration-300 ${currentMode === 'keyword' ? 'opacity-50 pointer-events-none' : ''}`}>
                <SelectInput 
                    label="Mô hình Quét (Khuyên dùng Flash)"
                    value={preset.smart_scan_model || 'gemini-2.5-flash'}
                    onChange={(e) => handleUpdate('smart_scan_model', e.target.value)}
                    options={MODEL_OPTIONS.map(opt => ({ value: opt.id, label: opt.name }))}
                    tooltip="Chọn mô hình AI để thực hiện việc quét. Gemini Flash nhanh và rẻ, phù hợp nhất cho tác vụ này."
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SliderInput
                        label="Độ sâu Quét (Tin nhắn)"
                        value={preset.smart_scan_depth || 3}
                        onChange={(v) => handleUpdate('smart_scan_depth', v)}
                        min={1}
                        max={10}
                        step={1}
                        tooltip="Số lượng tin nhắn gần nhất trong lịch sử trò chuyện sẽ được gửi cho AI để phân tích ngữ cảnh."
                    />

                    <SliderInput
                        label="Ngân sách Mục (Max Entries)"
                        value={preset.smart_scan_max_entries || 5}
                        onChange={(v) => handleUpdate('smart_scan_max_entries', v)}
                        min={1}
                        max={20}
                        step={1}
                        tooltip="Số lượng mục World Info tối đa mà AI được phép kích hoạt thêm trong mỗi lượt."
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
                                value={preset.smart_scan_system_prompt || defaultPreset.smart_scan_system_prompt || ''}
                                onChange={(e) => handleUpdate('smart_scan_system_prompt', e.target.value)}
                                rows={15}
                                tooltip="Tùy chỉnh cách AI suy nghĩ và lựa chọn thông tin. Đảm bảo giữ lại định dạng Output JSON."
                            />
                            
                            <div className="flex justify-end">
                                <button 
                                    onClick={resetPrompt}
                                    className="text-xs bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-300 px-3 py-2 rounded border border-slate-600 transition-colors"
                                >
                                    Khôi phục Mặc định
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

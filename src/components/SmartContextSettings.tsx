
import React, { useId } from 'react';
import type { SillyTavernPreset } from '../types';
import { Tooltip } from './Tooltip';

interface SmartContextSettingsProps {
    preset: SillyTavernPreset;
    onUpdate: (updatedPreset: SillyTavernPreset) => void;
}

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

const SelectInput: React.FC<{ label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; tooltipText?: string }> = ({ label, value, onChange, options, tooltipText }) => {
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
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    </div>
)};

const LabeledTextarea: React.FC<{ label: string; value: string; onChange: (value: string) => void; rows?: number, tooltipText?: string }> = ({ label, value, onChange, rows=6, tooltipText }) => {
    const id = useId();
    return (
    <div>
        <Tooltip text={tooltipText || ''}>
            <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1 cursor-help">{label}</label>
        </Tooltip>
        <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition font-sans text-sm"
        />
    </div>
)};

export const SmartContextSettings: React.FC<SmartContextSettingsProps> = ({ preset, onUpdate }) => {
    
    const handleUpdate = (key: keyof SillyTavernPreset, value: any) => {
        onUpdate({ ...preset, [key]: value });
    };

    return (
        <div className="space-y-8">
            <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-lg mb-4">
                <h4 className="font-bold text-indigo-300 mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>
                    Smart Context & Memory (Ngữ cảnh Thông minh)
                </h4>
                <p className="text-sm text-slate-300">
                    Cấu hình cách AI nhớ lại lịch sử trò chuyện và xử lý ngữ cảnh. Tùy chỉnh độ sâu bộ nhớ và chế độ gửi lời nhắc để tối ưu hóa trải nghiệm nhập vai.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <SliderInput
                        label="Ngưỡng Kích Hoạt Tóm Tắt (Context Depth)"
                        value={preset.context_depth || 20}
                        onChange={(v) => handleUpdate('context_depth', v)}
                        min={4}
                        max={100}
                        step={2}
                        tooltipText="Khi số lượng tin nhắn chưa tóm tắt đạt đến ngưỡng này, hệ thống sẽ kích hoạt tóm tắt. (Ví dụ: 20 tin nhắn)."
                    />

                    <SliderInput
                        label="Kích Thước Gói Tóm Tắt (Chunk Size)"
                        value={preset.summarization_chunk_size || 10}
                        onChange={(v) => handleUpdate('summarization_chunk_size', v)}
                        min={1}
                        max={preset.context_depth || 20}
                        step={1}
                        tooltipText="Số lượng tin nhắn CŨ NHẤT sẽ được cắt ra để tóm tắt mỗi lần kích hoạt. (Ví dụ: Cắt 10 tin cũ nhất, giữ lại 10 tin mới nhất làm ngữ cảnh)."
                    />

                    <SelectInput 
                        label="Chế độ Ghép nối Lịch sử"
                        value={preset.context_mode || 'standard'}
                        onChange={(v) => handleUpdate('context_mode', v)}
                        options={[
                            { value: 'standard', label: 'Tiêu chuẩn (Cả User & AI)' },
                            { value: 'ai_only', label: 'Chế độ Tự thuật (Chỉ AI)' }
                        ]}
                        tooltipText="'Tiêu chuẩn': Gửi toàn bộ hội thoại. 'Chế độ Tự thuật': Chỉ gửi các phản hồi của AI trong phần lịch sử, bỏ qua lời thoại của bạn để tạo cảm giác tiểu thuyết liền mạch và tiết kiệm token."
                    />
                </div>

                <div className="space-y-4">
                    <LabeledTextarea 
                        label="Lời nhắc Tóm tắt (Summarization Prompt)"
                        value={preset.summarization_prompt || ''}
                        onChange={(v) => handleUpdate('summarization_prompt', v)}
                        rows={10}
                        tooltipText="Hướng dẫn cho 'Thư Ký Ghi Chép'. AI sẽ sử dụng lời nhắc này để tóm tắt các đoạn hội thoại cũ thành Trí nhớ Dài hạn. Sử dụng {{chat_history_slice}} để chèn đoạn hội thoại cần tóm tắt."
                    />
                    <p className="text-xs text-slate-500 italic">
                        * Lời nhắc này được sử dụng khi lịch sử trò chuyện vượt quá "Độ sâu Cửa sổ Nhớ".
                    </p>
                </div>
            </div>
        </div>
    );
};

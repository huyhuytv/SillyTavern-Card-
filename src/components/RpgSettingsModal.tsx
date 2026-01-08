
import React, { useState, useEffect, useRef } from 'react';
import type { RPGDatabase, RPGSettings } from '../types/rpg';
import type { WorldInfoEntry } from '../types'; // Import WorldInfoEntry
import { MODEL_OPTIONS } from '../services/settingsService';
import { LabeledInput } from './ui/LabeledInput';
import { LabeledTextarea } from './ui/LabeledTextarea';
import { ToggleInput } from './ui/ToggleInput';
import { SelectInput } from './ui/SelectInput';
import { DEFAULT_MEDUSA_PROMPT } from '../services/medusaService';

interface RpgSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    database: RPGDatabase;
    onSave: (newDb: RPGDatabase) => void;
    lorebookEntries?: WorldInfoEntry[]; // New prop
}

type Tab = 'operation' | 'prompt' | 'context' | 'data'; // Added 'context'

const MACROS = [
    { label: '{{rpg_schema}}', desc: 'Cấu trúc bảng & cột' },
    { label: '{{rpg_data}}', desc: 'Dữ liệu hiện tại (JSON/Table)' },
    { label: '{{global_rules}}', desc: 'Luật chơi chung' },
    { label: '{{chat_history}}', desc: 'Lịch sử hội thoại gần nhất' },
    { label: '{{rpg_lorebook}}', desc: 'Dữ liệu Sổ tay (Hybrid)' }, // New Macro
];

export const RpgSettingsModal: React.FC<RpgSettingsModalProps> = ({ isOpen, onClose, database, onSave, lorebookEntries = [] }) => {
    const [activeTab, setActiveTab] = useState<Tab>('operation');
    const [settings, setSettings] = useState<RPGSettings>({
        triggerMode: 'auto',
        modelId: '',
        customSystemPrompt: DEFAULT_MEDUSA_PROMPT,
        pinnedLorebookUids: []
    });
    const promptInputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSettings({
                triggerMode: database.settings?.triggerMode || 'auto',
                modelId: database.settings?.modelId || '',
                customSystemPrompt: database.settings?.customSystemPrompt || DEFAULT_MEDUSA_PROMPT,
                triggerKeywords: database.settings?.triggerKeywords || [],
                pinnedLorebookUids: database.settings?.pinnedLorebookUids || []
            });
        }
    }, [isOpen, database]);

    const handleSave = () => {
        const newDb = { ...database, settings: settings };
        onSave(newDb);
        onClose();
    };

    const insertMacro = (macro: string) => {
        if (promptInputRef.current) {
            const start = promptInputRef.current.selectionStart;
            const end = promptInputRef.current.selectionEnd;
            const text = settings.customSystemPrompt || '';
            const newText = text.substring(0, start) + macro + text.substring(end);
            setSettings({ ...settings, customSystemPrompt: newText });
            
            setTimeout(() => {
                promptInputRef.current?.focus();
                promptInputRef.current?.setSelectionRange(start + macro.length, start + macro.length);
            }, 0);
        }
    };

    // --- IMPORT / EXPORT LOGIC ---
    const handleExport = (mode: 'schema' | 'full') => {
        const exportData = JSON.parse(JSON.stringify(database));
        
        if (mode === 'schema') {
            // Xóa dữ liệu hàng, giữ lại cấu trúc
            exportData.tables.forEach((t: any) => {
                t.data = { rows: [] };
            });
            exportData.lastUpdated = Date.now();
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MythicRPG_${mode}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const importedDb = JSON.parse(ev.target?.result as string);
                // Validate basic structure
                if (!importedDb.tables || !Array.isArray(importedDb.tables)) {
                    throw new Error("Cấu trúc file không hợp lệ.");
                }
                
                if (window.confirm("Hành động này sẽ GHI ĐÈ toàn bộ dữ liệu RPG hiện tại. Bạn có chắc chắn không?")) {
                    onSave(importedDb);
                    onClose();
                }
            } catch (err) {
                alert("Lỗi nhập file: " + err);
            }
        };
        reader.readAsText(file);
    };

    const togglePinnedLorebook = (uid: string) => {
        const currentPinned = settings.pinnedLorebookUids || [];
        if (currentPinned.includes(uid)) {
            setSettings({ ...settings, pinnedLorebookUids: currentPinned.filter(id => id !== uid) });
        } else {
            setSettings({ ...settings, pinnedLorebookUids: [...currentPinned, uid] });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[130] p-4">
            <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                
                {/* Header */}
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                    <h2 className="text-xl font-bold text-sky-400 flex items-center gap-2">
                        <span>⚙️</span> Cấu hình Mythic Engine
                    </h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-700 bg-slate-900">
                    <button onClick={() => setActiveTab('operation')} className={`flex-1 py-3 text-sm font-bold uppercase transition-colors ${activeTab === 'operation' ? 'text-sky-400 border-b-2 border-sky-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}>Vận hành</button>
                    <button onClick={() => setActiveTab('prompt')} className={`flex-1 py-3 text-sm font-bold uppercase transition-colors ${activeTab === 'prompt' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}>Lời nhắc (Prompt)</button>
                    <button onClick={() => setActiveTab('context')} className={`flex-1 py-3 text-sm font-bold uppercase transition-colors ${activeTab === 'context' ? 'text-fuchsia-400 border-b-2 border-fuchsia-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}>Ngữ cảnh (Context)</button>
                    <button onClick={() => setActiveTab('data')} className={`flex-1 py-3 text-sm font-bold uppercase transition-colors ${activeTab === 'data' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}>Dữ liệu (Data)</button>
                </div>

                {/* Body */}
                <div className="flex-grow p-6 overflow-y-auto custom-scrollbar bg-slate-900/50">
                    
                    {/* TAB A: OPERATION */}
                    {activeTab === 'operation' && (
                        <div className="space-y-6">
                            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                <h4 className="font-bold text-slate-200 mb-4">Mô hình AI (Game Master)</h4>
                                <SelectInput
                                    label="Chọn Model xử lý Logic RPG"
                                    value={settings.modelId || ''}
                                    onChange={(e) => setSettings({ ...settings, modelId: e.target.value })}
                                    options={[
                                        { value: '', label: 'Sử dụng Model Chat mặc định' },
                                        ...MODEL_OPTIONS.map(m => ({ value: m.id, label: m.name }))
                                    ]}
                                    tooltip="Chọn model riêng cho Medusa. Khuyên dùng Gemini Flash hoặc Flash-Lite để tiết kiệm chi phí và tăng tốc độ."
                                />
                            </div>

                            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                <h4 className="font-bold text-slate-200 mb-4">Chế độ Kích hoạt</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <button 
                                        onClick={() => setSettings({ ...settings, triggerMode: 'auto' })}
                                        className={`p-4 rounded-lg border text-left transition-all ${settings.triggerMode === 'auto' ? 'bg-sky-900/30 border-sky-500 ring-1 ring-sky-500' : 'bg-slate-900 border-slate-600 hover:bg-slate-800'}`}
                                    >
                                        <div className="font-bold text-sm mb-1 text-sky-300">🔴 Tự động (Auto)</div>
                                        <div className="text-xs text-slate-400">Chạy ngầm sau mỗi lượt chat của User. Mượt mà nhất.</div>
                                    </button>
                                    <button 
                                        onClick={() => setSettings({ ...settings, triggerMode: 'keyword' })}
                                        className={`p-4 rounded-lg border text-left transition-all ${settings.triggerMode === 'keyword' ? 'bg-amber-900/30 border-amber-500 ring-1 ring-amber-500' : 'bg-slate-900 border-slate-600 hover:bg-slate-800'}`}
                                    >
                                        <div className="font-bold text-sm mb-1 text-amber-300">🟡 Từ khóa (Keyword)</div>
                                        <div className="text-xs text-slate-400">Chỉ chạy khi User gõ từ khóa (ví dụ: [MUA], /check).</div>
                                    </button>
                                    <button 
                                        onClick={() => setSettings({ ...settings, triggerMode: 'manual' })}
                                        className={`p-4 rounded-lg border text-left transition-all ${settings.triggerMode === 'manual' ? 'bg-indigo-900/30 border-indigo-500 ring-1 ring-indigo-500' : 'bg-slate-900 border-slate-600 hover:bg-slate-800'}`}
                                    >
                                        <div className="font-bold text-sm mb-1 text-indigo-300">🔵 Thủ công (Manual)</div>
                                        <div className="text-xs text-slate-400">Chỉ chạy khi bạn bấm nút "Cập nhật RPG".</div>
                                    </button>
                                </div>

                                {settings.triggerMode === 'keyword' && (
                                    <div className="mt-4 animate-fade-in-up">
                                        <LabeledInput 
                                            label="Danh sách từ khóa (phân tách bằng dấu phẩy)"
                                            value={(settings.triggerKeywords || []).join(', ')}
                                            onChange={(e) => setSettings({ ...settings, triggerKeywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) })}
                                            placeholder="ví dụ: /buy, [CHECK], inventory"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB B: PROMPT */}
                    {activeTab === 'prompt' && (
                        <div className="flex flex-col h-full gap-4">
                            <div className="bg-indigo-900/20 p-3 rounded border border-indigo-500/30 text-xs text-indigo-200">
                                <strong className="block mb-1">Thiết kế tính cách Game Master (Medusa)</strong>
                                Bạn có thể sửa đổi prompt dưới đây để biến Medusa thành một Shopkeeper khó tính, một vị thần hào phóng, hoặc đơn giản là một hệ thống logic lạnh lùng.
                            </div>
                            
                            <div className="flex gap-2 flex-wrap">
                                {MACROS.map(m => (
                                    <button 
                                        key={m.label} 
                                        onClick={() => insertMacro(m.label)}
                                        className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-xs font-mono rounded border border-slate-600 text-sky-300"
                                        title={m.desc}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                                <button onClick={() => setSettings({ ...settings, customSystemPrompt: DEFAULT_MEDUSA_PROMPT })} className="px-2 py-1 bg-red-900/30 text-red-400 text-xs rounded hover:bg-red-900/50 ml-auto">
                                    Khôi phục Mặc định
                                </button>
                            </div>

                            <textarea 
                                ref={promptInputRef}
                                value={settings.customSystemPrompt}
                                onChange={(e) => setSettings({ ...settings, customSystemPrompt: e.target.value })}
                                className="flex-grow w-full bg-slate-800 border border-slate-600 rounded-lg p-4 font-mono text-sm text-slate-300 focus:ring-2 focus:ring-indigo-500 resize-none"
                            />
                        </div>
                    )}

                    {/* TAB C: CONTEXT (NEW) */}
                    {activeTab === 'context' && (
                        <div className="space-y-4">
                            <div className="bg-fuchsia-900/20 border border-fuchsia-500/30 p-4 rounded-lg">
                                <h4 className="font-bold text-fuchsia-300 mb-1">Cấu hình Ngữ cảnh Lai (Hybrid Context)</h4>
                                <p className="text-sm text-slate-300">
                                    Ngoài các mục được hệ thống Chat tự động quét (Scan), bạn có thể chọn thủ công các mục Sổ tay quan trọng bên dưới để <strong>luôn luôn gửi</strong> cho Medusa (ví dụ: Luật chơi, Định nghĩa chỉ số).
                                </p>
                            </div>

                            <div className="space-y-2">
                                {lorebookEntries.length === 0 ? (
                                    <p className="text-center text-slate-500 py-4 italic">Không tìm thấy mục Sổ tay nào.</p>
                                ) : (
                                    lorebookEntries.map((entry, idx) => {
                                        const uid = entry.uid || `entry_${idx}`;
                                        const isPinned = (settings.pinnedLorebookUids || []).includes(uid);
                                        
                                        return (
                                            <div 
                                                key={uid} 
                                                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                                    isPinned 
                                                    ? 'bg-fuchsia-900/20 border-fuchsia-500/50' 
                                                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                                                }`}
                                            >
                                                <div className="flex-grow min-w-0 pr-4">
                                                    <div className="flex items-center gap-2">
                                                        <h5 className={`font-bold text-sm truncate ${isPinned ? 'text-fuchsia-300' : 'text-slate-300'}`}>
                                                            {entry.comment || `Mục không tên #${idx + 1}`}
                                                        </h5>
                                                        {entry.constant && <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded border border-slate-600">Constant</span>}
                                                    </div>
                                                    <p className="text-xs text-slate-500 font-mono mt-1 line-clamp-1">
                                                        {entry.content}
                                                    </p>
                                                </div>
                                                <ToggleInput 
                                                    checked={isPinned} 
                                                    onChange={() => togglePinnedLorebook(uid)} 
                                                    label="Gửi cho Medusa" 
                                                    clean
                                                />
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB D: DATA */}
                    {activeTab === 'data' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full items-center">
                            
                            {/* EXPORT */}
                            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl text-center h-full flex flex-col justify-center hover:border-emerald-500/50 transition-colors">
                                <div className="text-4xl mb-4">📤</div>
                                <h3 className="text-lg font-bold text-emerald-400 mb-2">Xuất Dữ liệu (Export)</h3>
                                <p className="text-sm text-slate-400 mb-6">Lưu trữ hoặc chia sẻ hệ thống RPG của bạn.</p>
                                
                                <div className="space-y-3">
                                    <button 
                                        onClick={() => handleExport('full')}
                                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg"
                                    >
                                        Xuất Trọn gói (Full Save)
                                    </button>
                                    <button 
                                        onClick={() => handleExport('schema')}
                                        className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-emerald-300 font-bold rounded-lg border border-slate-600"
                                    >
                                        Chỉ Xuất Cấu trúc (Schema Template)
                                    </button>
                                </div>
                            </div>

                            {/* IMPORT */}
                            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl text-center h-full flex flex-col justify-center hover:border-sky-500/50 transition-colors">
                                <div className="text-4xl mb-4">📥</div>
                                <h3 className="text-lg font-bold text-sky-400 mb-2">Nhập Dữ liệu (Import)</h3>
                                <p className="text-sm text-slate-400 mb-6">Khôi phục từ file save hoặc tải template mới.</p>
                                
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept=".json" 
                                    onChange={handleImport}
                                />
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full py-10 border-2 border-dashed border-slate-600 hover:border-sky-500 rounded-xl text-slate-400 hover:text-sky-400 transition-all flex flex-col items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    <span>Chọn file JSON để tải lên</span>
                                </button>
                                <p className="text-xs text-red-400 mt-4 italic">Lưu ý: Dữ liệu hiện tại sẽ bị thay thế hoàn toàn.</p>
                            </div>

                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">Hủy bỏ</button>
                    <button onClick={handleSave} className="px-6 py-2 text-sm font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-lg">Lưu Cấu hình</button>
                </div>
            </div>
        </div>
    );
};

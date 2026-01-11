
import React, { useState, useEffect } from 'react';
import type { RPGDatabase, RPGTable, RPGColumn } from '../types/rpg';
import { LabeledInput } from './ui/LabeledInput';
import { LabeledTextarea } from './ui/LabeledTextarea';
import { ToggleInput } from './ui/ToggleInput';
import { SelectInput } from './ui/SelectInput';
import { getTemplateVH } from '../data/rpgTemplates';
import { useChatStore } from '../store/chatStore'; // Import Store
import { syncDatabaseToLorebook } from '../services/medusaService'; // Import Sync Logic
import { useToast } from './ToastSystem'; // Import Toast

interface RpgSchemaEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    database: RPGDatabase | undefined;
    onSave: (newDb: RPGDatabase) => void;
}

export const RpgSchemaEditorModal: React.FC<RpgSchemaEditorModalProps> = ({ isOpen, onClose, database, onSave }) => {
    const [dbState, setDbState] = useState<RPGDatabase>({ version: 2, tables: [] });
    const [activeTableId, setActiveTableId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'columns' | 'rules' | 'link'>('columns');

    // Hooks for Option A Logic
    const { setGeneratedLorebookEntries } = useChatStore();
    const { showToast } = useToast();

    useEffect(() => {
        if (isOpen) {
            if (!database || (database.version || 0) < 2) {
                setDbState(getTemplateVH());
            } else {
                setDbState(JSON.parse(JSON.stringify(database)));
            }
        }
    }, [isOpen, database]);

    useEffect(() => {
        if (dbState.tables.length > 0 && !activeTableId) {
            setActiveTableId(dbState.tables[0].config.id);
        }
    }, [dbState.tables]);

    const activeTable = dbState.tables.find(t => t.config.id === activeTableId);

    const updateTableConfig = (updates: any) => {
        if (!activeTableId) return;
        setDbState(prev => ({
            ...prev,
            tables: prev.tables.map(t => {
                if (t.config.id === activeTableId) {
                    return {
                        ...t,
                        config: { ...t.config, ...updates }
                    };
                }
                return t;
            })
        }));
    };

    const handleUpdateInstructions = (key: 'update' | 'insert' | 'delete', value: string) => {
        if (!activeTable) return;
        updateTableConfig({
            aiRules: {
                ...activeTable.config.aiRules,
                [key]: value
            }
        });
    };

    const handleUpdateLorebookLink = (key: 'enabled' | 'keyColumnId', value: any) => {
        if (!activeTable) return;
        updateTableConfig({
            lorebookLink: {
                ...(activeTable.config.lorebookLink || { enabled: false, keyColumnId: '' }),
                [key]: value
            }
        });
    };

    const handleAddColumn = () => {
        if (!activeTable) return;
        const newCol: RPGColumn = { id: `col_${Date.now()}`, label: 'Cột Mới', type: 'string' };
        updateTableConfig({ columns: [...activeTable.config.columns, newCol] });
    };

    const handleUpdateColumn = (index: number, updates: Partial<RPGColumn>) => {
        if (!activeTable) return;
        const newCols = [...activeTable.config.columns];
        newCols[index] = { ...newCols[index], ...updates };
        if (updates.label && !updates.id) {
            newCols[index].id = updates.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
        }
        updateTableConfig({ columns: newCols });
    };

    const handleRemoveColumn = (index: number) => {
        if (!activeTable) return;
        updateTableConfig({ columns: activeTable.config.columns.filter((_, i) => i !== index) });
    };

    const handleAddTable = () => {
        const newTable: RPGTable = {
            config: {
                id: `table_${Date.now()}`,
                name: 'Bảng Mới',
                description: '',
                columns: [{ id: 'name', label: 'Tên', type: 'string' }],
                export: { enabled: true, format: 'markdown_table', strategy: 'always' },
                aiRules: {}
            },
            data: { rows: [] }
        };
        setDbState(prev => ({ ...prev, tables: [...prev.tables, newTable] }));
        setActiveTableId(newTable.config.id);
    };

    const handleDeleteTable = (id: string) => {
        setDbState(prev => ({ ...prev, tables: prev.tables.filter(t => t.config.id !== id) }));
        if (activeTableId === id) setActiveTableId(null);
    };
    
    const handleResetToTemplate = () => {
        setDbState(getTemplateVH());
        setActiveTableId(null);
    };

    // --- OPTION A IMPLEMENTATION ---
    const handleSaveAndSync = () => {
        // 1. Save Structure
        onSave(dbState);

        // 2. Immediate Sync (Live-Link)
        try {
            const generatedEntries = syncDatabaseToLorebook(dbState);
            setGeneratedLorebookEntries(generatedEntries);
            
            if (generatedEntries.length > 0) {
                showToast(`[Live-Link] Đã đồng bộ ${generatedEntries.length} mục vào Sổ tay!`, 'success');
            }
        } catch (e) {
            console.error("Live-Link Sync Error:", e);
            showToast("Lỗi đồng bộ Live-Link", 'error');
        }

        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
            <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                    <h2 className="text-xl font-bold text-sky-400 flex items-center gap-2">
                        <span>🛠️</span> Schema Builder (V2 - 2D Array)
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={handleResetToTemplate} className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded border border-slate-600">
                            Reset Template
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors" aria-label="Đóng trình chỉnh sửa">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="flex flex-grow overflow-hidden">
                    <div className="w-64 bg-slate-800/50 border-r border-slate-700 flex flex-col shrink-0">
                        <div className="p-3 border-b border-slate-700 font-bold text-slate-300 text-sm uppercase tracking-wider">
                            Danh Sách Bảng
                        </div>
                        <div className="flex-grow overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {dbState.tables.map(table => (
                                <div 
                                    key={table.config.id}
                                    className={`group flex items-center justify-between p-2 rounded cursor-pointer text-sm ${activeTableId === table.config.id ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                                    onClick={() => setActiveTableId(table.config.id)}
                                >
                                    <span className="truncate">{table.config.name}</span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteTable(table.config.id); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-300 transition-opacity"
                                        aria-label={`Xóa bảng ${table.config.name}`}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="p-3 border-t border-slate-700">
                            <button onClick={handleAddTable} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-sky-400 font-bold text-xs rounded border border-slate-600 border-dashed">
                                + Thêm Bảng Mới
                            </button>
                        </div>
                    </div>

                    <div className="flex-grow flex flex-col bg-slate-900/50 overflow-hidden">
                        {activeTable ? (
                            <>
                                <div className="p-4 border-b border-slate-700 flex gap-4 items-end">
                                    <div className="flex-grow">
                                        <LabeledInput 
                                            label="Tên Bảng" 
                                            value={activeTable.config.name} 
                                            onChange={(e) => updateTableConfig({ name: e.target.value })} 
                                        />
                                    </div>
                                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 h-10">
                                        <button onClick={() => setActiveTab('columns')} className={`px-4 text-xs font-bold rounded transition-colors ${activeTab === 'columns' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}>Cột</button>
                                        <button onClick={() => setActiveTab('rules')} className={`px-4 text-xs font-bold rounded transition-colors ${activeTab === 'rules' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>Luật AI</button>
                                        <button onClick={() => setActiveTab('link')} className={`px-4 text-xs font-bold rounded transition-colors ${activeTab === 'link' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>Live-Link</button>
                                    </div>
                                </div>

                                <div className="flex-grow overflow-y-auto p-6 custom-scrollbar">
                                    {activeTab === 'columns' && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <h3 className="text-sm font-bold text-slate-300">Cấu trúc Cột</h3>
                                                <button onClick={handleAddColumn} className="text-xs bg-sky-600/20 text-sky-400 px-3 py-1 rounded hover:bg-sky-600/40">+ Thêm</button>
                                            </div>
                                            <div className="grid gap-3">
                                                {activeTable.config.columns.map((col, idx) => (
                                                    <div key={idx} className="flex gap-3 items-center bg-slate-800 p-3 rounded border border-slate-700">
                                                        <div className="w-8 text-center text-slate-500 font-mono text-xs">{idx}</div>
                                                        <input 
                                                            type="text" 
                                                            value={col.label} 
                                                            onChange={(e) => handleUpdateColumn(idx, { label: e.target.value })}
                                                            className="flex-grow bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                                                            placeholder="Tên hiển thị"
                                                        />
                                                        <input 
                                                            type="text" 
                                                            value={col.id} 
                                                            onChange={(e) => handleUpdateColumn(idx, { id: e.target.value })}
                                                            className="w-32 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-indigo-300 font-mono"
                                                            placeholder="Key ID"
                                                        />
                                                        <select 
                                                            value={col.type} 
                                                            onChange={(e) => handleUpdateColumn(idx, { type: e.target.value as any })}
                                                            className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-300 w-24"
                                                        >
                                                            <option value="string">Text</option>
                                                            <option value="number">Number</option>
                                                            <option value="boolean">Bool</option>
                                                        </select>
                                                        <button onClick={() => handleRemoveColumn(idx)} className="text-red-400 hover:bg-red-900/30 p-1 rounded" aria-label={`Xóa cột ${col.label}`}>×</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {activeTab === 'rules' && (
                                        <div className="space-y-6">
                                            <LabeledTextarea 
                                                label="Mô tả chung (Description)" 
                                                value={activeTable.config.description || ''} 
                                                onChange={(e) => updateTableConfig({ description: e.target.value })}
                                                rows={2}
                                            />
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <LabeledTextarea 
                                                    label="Luật Cập nhật (Update Rule)" 
                                                    value={activeTable.config.aiRules?.update || ''} 
                                                    onChange={(e) => handleUpdateInstructions('update', e.target.value)}
                                                    rows={4}
                                                />
                                                <LabeledTextarea 
                                                    label="Luật Thêm mới (Insert Rule)" 
                                                    value={activeTable.config.aiRules?.insert || ''} 
                                                    onChange={(e) => handleUpdateInstructions('insert', e.target.value)}
                                                    rows={4}
                                                />
                                                <LabeledTextarea 
                                                    label="Luật Xóa (Delete Rule)" 
                                                    value={activeTable.config.aiRules?.delete || ''} 
                                                    onChange={(e) => handleUpdateInstructions('delete', e.target.value)}
                                                    rows={4}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {activeTab === 'link' && (
                                        <div className="space-y-6">
                                            <div className="bg-emerald-900/20 border border-emerald-500/30 p-4 rounded-lg">
                                                <h4 className="font-bold text-emerald-400 mb-2">Live-Link (Tự động hóa Lorebook)</h4>
                                                <p className="text-sm text-slate-300">
                                                    Biến mỗi dòng trong bảng này thành một mục World Info (Sổ tay) động.
                                                    Dữ liệu sẽ được tự động đồng bộ sau mỗi lượt chat.
                                                </p>
                                                <div className="mt-4 bg-black/20 p-2 rounded text-xs text-slate-400 font-mono">
                                                    Logic: Khi kích hoạt, nội dung bảng này sẽ bị ẩn khỏi Prompt chính để tiết kiệm Token.
                                                    Thay vào đó, các dòng dữ liệu sẽ trở thành các mục World Info có thể được tìm kiếm (Smart Scan) hoặc kích hoạt bằng từ khóa.
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <ToggleInput 
                                                    label="Kích hoạt Live-Link cho bảng này" 
                                                    checked={activeTable.config.lorebookLink?.enabled || false} 
                                                    onChange={(v) => handleUpdateLorebookLink('enabled', v)}
                                                />

                                                <div className={`transition-opacity duration-300 ${!activeTable.config.lorebookLink?.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    <SelectInput 
                                                        label="Cột Từ khóa (Key Column)"
                                                        value={activeTable.config.lorebookLink?.keyColumnId || ''}
                                                        onChange={(e) => handleUpdateLorebookLink('keyColumnId', e.target.value)}
                                                        options={[
                                                            { value: '', label: '-- Chọn cột làm từ khóa --' },
                                                            ...activeTable.config.columns.map(col => ({ value: col.id, label: col.label }))
                                                        ]}
                                                        tooltip="Giá trị của cột này sẽ được dùng làm 'Keys' cho mục World Info tương ứng."
                                                    />
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        Ví dụ: Chọn cột "Tên Vật Phẩm". Khi dòng có tên "Kiếm Thần", hệ thống sẽ tạo mục WI với key ["Kiếm Thần"].
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-500 italic">Chọn bảng để sửa</div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">Hủy</button>
                    {/* UPDATED: Handle Save & Sync */}
                    <button onClick={handleSaveAndSync} className="px-6 py-2 text-sm font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white">Lưu Cấu Trúc</button>
                </div>
            </div>
        </div>
    );
};

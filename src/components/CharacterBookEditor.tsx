
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { WorldInfoEntry } from '../types';
import { Tooltip } from './Tooltip';

// --- Helper Components ---

const CopyButton: React.FC<{ textToCopy: string, className?: string }> = ({ textToCopy, className }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className={`p-1.5 bg-slate-600/50 hover:bg-slate-500/70 rounded-md text-slate-400 hover:text-white transition-colors ${className}`}
            title={copied ? "Đã sao chép!" : "Sao chép"}
        >
            {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
        </button>
    );
};

const ToggleInput: React.FC<{ label?: string; checked: boolean; onChange: (checked: boolean) => void; tooltip?: string; disabled?: boolean }> = ({ label, checked, onChange, tooltip, disabled }) => (
    <div className="flex items-center gap-2">
        {label && <label className="text-sm font-medium text-slate-300">{label}</label>}
        <Tooltip text={tooltip || ''}>
            <button
                type="button"
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
                className={`${
                    checked ? 'bg-sky-500' : 'bg-slate-600'
                } relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed`}
                role="switch"
                aria-checked={checked}
            >
                <span
                    aria-hidden="true"
                    className={`${
                        checked ? 'translate-x-4' : 'translate-x-0'
                    } pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                />
            </button>
        </Tooltip>
    </div>
);

const LabeledInput: React.FC<{ label: string; value: string; onChange: (val: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
    <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <input 
            type="text" 
            value={value} 
            onChange={e => onChange(e.target.value)} 
            placeholder={placeholder}
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
        />
    </div>
);

const LabeledTextarea: React.FC<{ label: string; value: string; onChange: (val: string) => void; rows?: number }> = ({ label, value, onChange, rows = 3 }) => (
    <div className="relative">
        <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <textarea 
            value={value} 
            onChange={e => onChange(e.target.value)} 
            rows={rows}
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 pr-8 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition font-mono text-sm"
        />
        <div className="absolute top-8 right-2">
            <CopyButton textToCopy={value} />
        </div>
    </div>
);

// --- Reusable PlacementControl ---
const PlacementControl: React.FC<{
    value: string | undefined;
    onChange: (val: string | undefined) => void;
}> = ({ value, onChange }) => {
    const currentMode = (() => {
        if (value === undefined || value === null) return undefined;
        // Fix: Ensure value is string before checking includes (handles numeric positions from V3 cards)
        const valStr = String(value);
        if (valStr.includes('after')) return 'after';
        if (valStr.includes('before')) return 'before';
        return undefined;
    })();

    const optionClass = (active: boolean, colorClass: string) => 
        `flex-1 px-2 py-1 text-xs font-bold transition-colors flex items-center justify-center gap-1 ${
            active ? `${colorClass} text-white shadow-sm` : 'text-slate-400 hover:text-slate-200 hover:bg-slate-600/50'
        }`;

    const handleClick = (mode: 'before' | 'after' | undefined) => {
        if (mode === undefined) onChange('');
        else if (mode === 'before') onChange('before_char');
        else if (mode === 'after') onChange('after_char');
    };

    return (
        <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300 mb-1">Vị trí</label>
            <div className="flex bg-slate-700 border border-slate-600 rounded-md p-1 w-full" role="radiogroup">
                <button onClick={() => handleClick(undefined)} className={`rounded-l-sm ${optionClass(currentMode === undefined, 'bg-slate-600')}`} title="Mặc định">Mặc định</button>
                <button onClick={() => handleClick('before')} className={optionClass(currentMode === 'before', 'bg-sky-600')} title="Đầu Prompt">Đầu</button>
                <button onClick={() => handleClick('after')} className={`rounded-r-sm ${optionClass(currentMode === 'after', 'bg-violet-600')}`} title="Cuối Prompt">Cuối</button>
            </div>
        </div>
    );
};

// --- Filter Component ---
type FilterType = 'all' | 'enabled' | 'disabled' | 'constant';

const FilterButton: React.FC<{
    filter: FilterType;
    currentFilter: FilterType;
    onClick: (filter: FilterType) => void;
    label: string;
    count?: number;
}> = ({ filter, currentFilter, onClick, label, count }) => (
    <button
        onClick={() => onClick(filter)}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-2 ${
            currentFilter === filter
                ? 'bg-sky-600 text-white shadow-sm ring-1 ring-sky-400'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
        }`}
    >
        {label}
        {count !== undefined && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${currentFilter === filter ? 'bg-sky-800 text-sky-100' : 'bg-slate-800 text-slate-500'}`}>
                {count}
            </span>
        )}
    </button>
);

// --- Modal Component ---

interface WorldInfoEditModalProps {
    isOpen: boolean;
    entry: WorldInfoEntry | null;
    onSave: (updatedEntry: WorldInfoEntry) => void;
    onClose: () => void;
}

const WorldInfoEditModal: React.FC<WorldInfoEditModalProps> = ({ isOpen, entry, onSave, onClose }) => {
    const [editedEntry, setEditedEntry] = useState<WorldInfoEntry | null>(null);
    
    // Focus trap refs
    const modalRef = useRef<HTMLDivElement>(null);
    const triggerElementRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (entry) {
            setEditedEntry(JSON.parse(JSON.stringify(entry)));
        } else {
            setEditedEntry(null);
        }
    }, [entry, isOpen]);

    // Keyboard handling for Modal
    useEffect(() => {
        if (!isOpen) return;

        triggerElementRef.current = document.activeElement as HTMLElement;

        setTimeout(() => {
            const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            firstFocusable?.focus();
        }, 100);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();

            if (e.key === 'Tab' && modalRef.current) {
                const focusableElements = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                )).filter((el: HTMLElement) => el.offsetParent !== null);
                
                if (focusableElements.length === 0) return;

                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) { // Shift + Tab
                    if (document.activeElement === firstElement) {
                        (lastElement as HTMLElement).focus();
                        e.preventDefault();
                    }
                } else { // Tab
                    if (document.activeElement === lastElement) {
                        (firstElement as HTMLElement).focus();
                        e.preventDefault();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            triggerElementRef.current?.focus();
        };
    }, [isOpen, onClose]);

    if (!isOpen || !editedEntry) return null;

    const handleChange = (field: keyof WorldInfoEntry, value: any) => {
        setEditedEntry(prev => prev ? { ...prev, [field]: value } : null);
    };

    const handleKeysChange = (val: string) => {
        handleChange('keys', val.split(',').map(k => k.trim()).filter(Boolean));
    };
    
    const handleSecondaryKeysChange = (val: string) => {
        handleChange('secondary_keys', val.split(',').map(k => k.trim()).filter(Boolean));
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div 
                ref={modalRef}
                className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-fade-in-up" 
                onClick={e => e.stopPropagation()}
            >
                <header className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50 rounded-t-xl">
                    <h3 className="text-xl font-bold text-sky-400">Chỉnh sửa Mục World Info</h3>
                    <button 
                        onClick={onClose} 
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                
                <main className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-grow">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <LabeledInput 
                            label="Tiêu đề (Bình luận)" 
                            value={editedEntry.comment || ''} 
                            onChange={v => handleChange('comment', v)} 
                            placeholder="Đặt tên cho mục này..."
                        />
                        <LabeledInput 
                            label="Từ khóa chính (Phân tách bằng dấu phẩy)" 
                            value={(editedEntry.keys || []).join(', ')} 
                            onChange={handleKeysChange} 
                            placeholder="Ví dụ: gươm, kiếm, vũ khí"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <LabeledInput 
                            label="Từ khóa phụ (Tùy chọn, lọc kỹ hơn)" 
                            value={(editedEntry.secondary_keys || []).join(', ')} 
                            onChange={handleSecondaryKeysChange} 
                            placeholder="Ví dụ: cổ đại (chỉ kích hoạt nếu có cả từ khóa chính và 'cổ đại')"
                        />
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Thứ tự chèn</label>
                                <input 
                                    type="number" 
                                    value={editedEntry.insertion_order ?? 100} 
                                    onChange={e => handleChange('insertion_order', parseInt(e.target.value))}
                                    className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200"
                                />
                             </div>
                             <PlacementControl value={editedEntry.position} onChange={v => handleChange('position', v)} />
                        </div>
                    </div>

                    <LabeledTextarea 
                        label="Nội dung" 
                        value={editedEntry.content || ''} 
                        onChange={v => handleChange('content', v)} 
                        rows={8}
                    />

                    <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-slate-400 uppercase">Trạng thái</label>
                            <ToggleInput label="Đã bật (Enabled)" checked={editedEntry.enabled !== false} onChange={v => handleChange('enabled', v)} />
                            <ToggleInput label="Hằng số (Constant)" checked={!!editedEntry.constant} onChange={v => handleChange('constant', v)} tooltip="Luôn luôn gửi đi, bỏ qua kiểm tra từ khóa." />
                        </div>
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-slate-400 uppercase">Logic</label>
                            <ToggleInput label="Chọn lọc (Selective)" checked={!!editedEntry.selective} onChange={v => handleChange('selective', v)} tooltip="Chỉ kích hoạt khi từ khóa xuất hiện." />
                            <ToggleInput label="Dùng Regex" checked={!!editedEntry.use_regex} onChange={v => handleChange('use_regex', v)} tooltip="Xử lý từ khóa như biểu thức chính quy." />
                        </div>
                        
                        {/* Advanced Stats if needed */}
                        <div className="md:col-span-2 grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Sticky (Duy trì)</label>
                                <input type="number" value={editedEntry.sticky || 0} onChange={e => handleChange('sticky', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded p-1 text-sm text-center" placeholder="0" title="Số lượt duy trì sau khi kích hoạt" />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Cooldown (Hồi chiêu)</label>
                                <input type="number" value={editedEntry.cooldown || 0} onChange={e => handleChange('cooldown', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded p-1 text-sm text-center" placeholder="0" title="Số lượt chặn sau khi hết hiệu lực" />
                             </div>
                        </div>
                    </div>
                </main>

                <footer className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/50 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">Hủy</button>
                    <button onClick={() => { onSave(editedEntry); onClose(); }} className="px-6 py-2 text-sm font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors">Lưu Thay đổi</button>
                </footer>
            </div>
        </div>
    );
};

// --- List Item Component ---

interface WorldInfoItemProps {
    entry: WorldInfoEntry;
    index: number;
    onUpdate: (index: number, updatedEntry: WorldInfoEntry) => void;
    onRemove: (index: number) => void;
    onEdit: (index: number) => void;
}

const WorldInfoItem: React.FC<WorldInfoItemProps> = ({ entry, index, onUpdate, onRemove, onEdit }) => {
    // Check if the entry is marked for deletion (stored in the extra field __deleted)
    const isMarkedForDeletion = !!entry.__deleted;

    const handleToggleEnabled = (checked: boolean) => {
        if (!isMarkedForDeletion) {
            onUpdate(index, { ...entry, enabled: checked });
        }
    };

    const handleToggleConstant = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isMarkedForDeletion) {
            onUpdate(index, { ...entry, constant: !entry.constant });
        }
    };

    // Keyboard navigation handler
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isMarkedForDeletion) onEdit(index);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = (e.currentTarget.nextElementSibling as HTMLElement);
            if (next) next.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = (e.currentTarget.previousElementSibling as HTMLElement);
            if (prev) prev.focus();
        }
    };

    return (
        <div 
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onClick={() => !isMarkedForDeletion && onEdit(index)}
            className={`group flex items-start gap-3 p-4 border rounded-lg transition-all cursor-pointer focus:ring-2 focus:ring-sky-500 focus:outline-none 
                ${isMarkedForDeletion 
                    ? 'bg-red-900/20 border-red-500/50 opacity-75 hover:opacity-100 hover:bg-red-900/30' 
                    : `bg-slate-800 border-slate-700 hover:bg-slate-750 hover:border-sky-500/50 ${!entry.enabled ? 'opacity-60' : ''}`
                }
            `}
        >
            {/* 1. Toggle Switch */}
            <div onClick={e => e.stopPropagation()} className="flex-shrink-0 self-start mt-1">
                <ToggleInput 
                    checked={entry.enabled !== false} 
                    onChange={handleToggleEnabled} 
                    disabled={isMarkedForDeletion}
                />
            </div>

            {/* 2. Main Content (Title & Body) */}
            <div className="flex-grow min-w-0 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={`font-bold text-base truncate m-0 ${
                        isMarkedForDeletion 
                            ? 'text-red-300 line-through decoration-red-500' 
                            : (entry.enabled !== false ? 'text-slate-200' : 'text-slate-500 line-through')
                    }`}>
                        {entry.comment || 'Không có tiêu đề'}
                        {isMarkedForDeletion && <span className="ml-2 text-xs text-red-400 no-underline font-normal italic">(Đã đánh dấu xóa)</span>}
                    </h4>
                    {entry.keys && entry.keys.length > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border truncate max-w-[200px] ${
                            isMarkedForDeletion 
                                ? 'bg-red-900/40 text-red-300 border-red-800' 
                                : 'bg-slate-700 text-slate-400 border-slate-600'
                        }`}>
                            {entry.keys.join(', ')}
                        </span>
                    )}
                </div>
                
                {/* Full Content Display */}
                <div 
                    className={`text-xs font-mono p-3 rounded border whitespace-pre-wrap break-words select-text cursor-text transition-colors ${
                        isMarkedForDeletion 
                            ? 'bg-red-950/30 text-red-200/70 border-red-900/30' 
                            : 'bg-slate-900/50 text-slate-300 border-slate-700/50 hover:bg-slate-900/70'
                    }`}
                    onClick={e => e.stopPropagation()}
                >
                    {entry.content || <span className="text-slate-600 italic">(Trống)</span>}
                </div>
            </div>

            {/* 3. Right Actions */}
            <div className="flex flex-col gap-3 flex-shrink-0 items-end self-start">
                {/* Text-based Constant Button */}
                <button
                    onClick={handleToggleConstant}
                    disabled={isMarkedForDeletion}
                    className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wide rounded border transition-all shadow-sm ${
                        isMarkedForDeletion 
                            ? 'opacity-50 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-600'
                            : entry.constant 
                                ? 'bg-amber-900/40 text-amber-400 border-amber-600 hover:bg-amber-900/60' 
                                : 'bg-slate-700 text-slate-500 border-slate-600 hover:text-slate-300 hover:bg-slate-650'
                    }`}
                >
                    {entry.constant ? 'Hằng số: BẬT' : 'Hằng số: TẮT'}
                </button>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    {/* Edit Button - Disable if marked for deletion */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(index); }}
                        disabled={isMarkedForDeletion}
                        className={`p-1.5 rounded-md transition-colors ${
                            isMarkedForDeletion 
                                ? 'text-slate-600 cursor-not-allowed' 
                                : 'text-slate-400 hover:text-sky-400 hover:bg-slate-700'
                        }`}
                        aria-label="Chỉnh sửa"
                        title="Chỉnh sửa chi tiết"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                    </button>

                    {/* Delete/Undo Button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                        className={`p-1.5 rounded-md transition-colors ${
                            isMarkedForDeletion 
                                ? 'text-green-400 hover:text-green-300 hover:bg-green-900/30' 
                                : 'text-slate-500 hover:text-red-400 hover:bg-slate-700'
                        }`}
                        aria-label={isMarkedForDeletion ? "Hoàn tác xóa" : "Xóa"}
                        title={isMarkedForDeletion ? "Hủy đánh dấu xóa" : "Đánh dấu để xóa"}
                    >
                        {isMarkedForDeletion ? (
                            // Undo Icon
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L9.414 11H13a1 1 0 100-2H9.414l1.293-1.293z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            // Trash Icon
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Main Container Component ---

interface CharacterBookEditorProps {
    entries: WorldInfoEntry[];
    onUpdate: (entries: WorldInfoEntry[]) => void;
    className?: string; // Add className to prop support
}

export const CharacterBookEditor: React.FC<CharacterBookEditorProps> = ({ entries, onUpdate, className = '' }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<FilterType>('all');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    const handleUpdateEntry = useCallback((index: number, updatedEntry: WorldInfoEntry) => {
        const newEntries = [...entries];
        // Ensure UID exists
        if (!updatedEntry.uid) {
            updatedEntry.uid = `entry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        newEntries[index] = updatedEntry;
        onUpdate(newEntries);
    }, [entries, onUpdate]);

    const handleRemoveEntry = useCallback((index: number) => {
        // Logic mới: Chỉ đánh dấu để xóa (toggle), không xóa ngay lập tức.
        const newEntries = [...entries];
        const entry = newEntries[index];
        
        // Toggle status
        newEntries[index] = {
            ...entry,
            __deleted: !entry.__deleted
        };
        
        onUpdate(newEntries);
    }, [entries, onUpdate]);

    const handleAddEntry = useCallback(() => {
        const newEntry: WorldInfoEntry = { 
            keys: [], 
            content: '', 
            comment: 'Mục mới',
            enabled: true,
            insertion_order: 100,
            selective: true,
            constant: false,
            use_regex: false,
            position: 'before_char',
            uid: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        };
        // Add to the END of the list
        onUpdate([...entries, newEntry]);
        // Automatically open edit for new item
        setEditingIndex(entries.length); 
    }, [entries, onUpdate]);

    // Filter Logic
    const filteredItems = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => {
        // 1. Search Filter
        let matchesSearch = true;
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            const inComment = (entry.comment || '').toLowerCase().includes(lowerTerm);
            const inKeys = (entry.keys || []).some(k => k.toLowerCase().includes(lowerTerm));
            const inContent = (entry.content || '').toLowerCase().includes(lowerTerm);
            matchesSearch = inComment || inKeys || inContent;
        }

        // 2. Status Filter
        let matchesFilter = true;
        if (filter === 'enabled') matchesFilter = entry.enabled !== false;
        else if (filter === 'disabled') matchesFilter = entry.enabled === false;
        else if (filter === 'constant') matchesFilter = entry.constant === true;

        return matchesSearch && matchesFilter;
    });

    // Count statistics for filters
    const counts = {
        all: entries.length,
        enabled: entries.filter(e => e.enabled !== false).length,
        disabled: entries.filter(e => e.enabled === false).length,
        constant: entries.filter(e => e.constant === true).length,
    };

    return (
        <div className={`flex flex-col gap-4 ${className}`}>
            {/* Header & Search & Filter */}
            <div className="flex flex-col gap-3 bg-slate-800/50 p-3 rounded-lg border border-slate-700 shrink-0">
                {/* Search Bar Row */}
                <div className="flex items-center justify-between gap-4">
                    <div className="relative flex-grow">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Tìm kiếm..."
                            className="pl-9 w-full bg-slate-700 border border-slate-600 rounded-md py-1.5 text-sm text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                        />
                    </div>
                    <div className="text-xs text-slate-500 font-mono whitespace-nowrap">
                        {filteredItems.length} / {entries.length}
                    </div>
                </div>

                {/* Filter Bar Row */}
                <div className="flex items-center gap-2 flex-wrap">
                    <FilterButton filter="all" currentFilter={filter} onClick={setFilter} label="Tất cả" count={counts.all} />
                    <FilterButton filter="enabled" currentFilter={filter} onClick={setFilter} label="Đang bật" count={counts.enabled} />
                    <FilterButton filter="disabled" currentFilter={filter} onClick={setFilter} label="Đã tắt" count={counts.disabled} />
                    <FilterButton filter="constant" currentFilter={filter} onClick={setFilter} label="Hằng số" count={counts.constant} />
                </div>
            </div>

            {/* List */}
            <div className="flex-grow space-y-2 overflow-y-auto custom-scrollbar pr-1 min-h-0">
                {filteredItems.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 bg-slate-800/30 rounded-lg border border-dashed border-slate-700">
                        <p>Không tìm thấy mục nào.</p>
                    </div>
                ) : (
                    filteredItems.map(({ entry, index }) => (
                        <WorldInfoItem
                            key={entry.uid || index}
                            entry={entry}
                            index={index}
                            onUpdate={handleUpdateEntry}
                            onRemove={handleRemoveEntry}
                            onEdit={() => setEditingIndex(index)}
                        />
                    ))
                )}
            </div>

            {/* Add Button */}
            <button
                onClick={handleAddEntry}
                className="w-full bg-slate-700 hover:bg-slate-600 text-sky-400 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 border border-slate-600 hover:border-sky-500/50 group shrink-0"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform group-hover:scale-110 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                </svg>
                <span>Thêm Mục Mới</span>
            </button>

            {/* Edit Modal */}
            <WorldInfoEditModal 
                isOpen={editingIndex !== null}
                entry={editingIndex !== null ? entries[editingIndex] : null}
                onClose={() => setEditingIndex(null)}
                onSave={(updatedEntry) => {
                    if (editingIndex !== null) {
                        handleUpdateEntry(editingIndex, updatedEntry);
                    }
                }}
            />
        </div>
    );
};

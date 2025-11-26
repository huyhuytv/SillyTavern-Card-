import React, { useId, useEffect, useRef } from 'react';
import type { WorldInfoEntry } from '../types';

const ToggleInput: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; "aria-label"?: string; }> = ({ label, checked, onChange, "aria-label": ariaLabel }) => {
    const id = useId();
    const hasVisibleLabel = !!label;

    return (
    <div className="flex items-center">
        {hasVisibleLabel && <label id={id} className="text-sm font-medium text-slate-300 mr-3">{label}</label>}
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`${
                checked ? 'bg-sky-500' : 'bg-slate-600'
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800`}
            role="switch"
            aria-checked={checked}
            aria-label={!hasVisibleLabel ? ariaLabel : undefined}
            aria-labelledby={hasVisibleLabel ? id : undefined}
        >
            <span
                aria-hidden="true"
                className={`${
                    checked ? 'translate-x-5' : 'translate-x-0'
                } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
        </button>
    </div>
)};

// --- NEW COMPONENT: Segmented Control for Placement ---
const PlacementControl: React.FC<{
    value: 'before' | 'after' | undefined;
    onChange: (val: 'before' | 'after' | undefined) => void;
}> = ({ value, onChange }) => {
    const optionClass = (active: boolean, colorClass: string) => 
        `flex-1 px-3 py-1.5 text-xs font-bold transition-colors flex items-center justify-center gap-1 ${
            active ? `${colorClass} text-white shadow-sm` : 'text-slate-400 hover:text-slate-200 hover:bg-slate-600/50'
        }`;

    return (
        <div className="flex bg-slate-800 rounded-md p-1 border border-slate-600/50 min-w-[200px]" role="radiogroup" aria-label="Vị trí chèn World Info">
            <button 
                onClick={() => onChange(undefined)}
                className={`rounded-l-sm ${optionClass(value === undefined, 'bg-slate-600')}`}
                role="radio"
                aria-checked={value === undefined}
                aria-label="Vị trí: Mặc định (Theo thẻ)"
                title="Mặc định (Theo cài đặt thẻ)"
            >
               Mặc định
            </button>
            <button 
                onClick={() => onChange('before')}
                className={optionClass(value === 'before', 'bg-sky-600')}
                role="radio"
                aria-checked={value === 'before'}
                aria-label="Vị trí: Đầu Prompt (Before)"
                title="Ưu tiên: Đầu Prompt (Quy tắc/Bối cảnh)"
            >
               Đầu
            </button>
            <button 
                onClick={() => onChange('after')}
                className={`rounded-r-sm ${optionClass(value === 'after', 'bg-violet-600')}`}
                role="radio"
                aria-checked={value === 'after'}
                aria-label="Vị trí: Cuối Prompt (After)"
                title="Ngữ cảnh: Cuối Prompt (Chi tiết/Trạng thái)"
            >
               Cuối
            </button>
        </div>
    );
};


interface WorldInfoManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    entries: WorldInfoEntry[];
    worldInfoState: Record<string, boolean>;
    worldInfoPinned: Record<string, boolean>;
    worldInfoPlacement: Record<string, 'before' | 'after' | undefined>;
    onUpdate: (newState: Record<string, boolean>) => void;
    onUpdatePinned: (newPinnedState: Record<string, boolean>) => void;
    onUpdatePlacement: (newPlacementState: Record<string, 'before' | 'after' | undefined>) => void;
}

const WorldInfoItem: React.FC<{
    entry: WorldInfoEntry;
    isEnabled: boolean;
    isPinned: boolean;
    placement: 'before' | 'after' | undefined;
    onToggle: (uid: string, isEnabled: boolean) => void;
    onPin: (uid: string, isPinned: boolean) => void;
    onPlacementChange: (uid: string, val: 'before' | 'after' | undefined) => void;
}> = ({ entry, isEnabled, isPinned, placement, onToggle, onPin, onPlacementChange }) => {
    if (!entry.uid) return null;

    return (
        <div className={`bg-slate-700/50 border border-slate-600 rounded-lg p-4 flex flex-col gap-3 transition-all ${isPinned ? 'ring-1 ring-amber-500/50 bg-slate-700/80' : ''}`}>
            {/* Row 1: Header */}
            <div className="flex justify-between items-start">
                 <div>
                    <h3 className="font-bold text-base text-sky-300">{entry.comment || 'Mục không có tên'}</h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">Keys: {(entry.keys || []).join(', ')}</p>
                 </div>
            </div>

            {/* Row 2: Content */}
            <div className="bg-slate-800/50 rounded p-2 text-sm text-slate-300 max-h-32 overflow-y-auto custom-scrollbar whitespace-pre-wrap font-sans border border-slate-700/50">
                {entry.content}
            </div>

            {/* Row 3: Action Bar */}
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-600/30 gap-y-2">
                 <div className="flex items-center gap-3 flex-wrap">
                     {/* Toggle Enable */}
                     <div className="flex items-center gap-2 bg-slate-800/50 px-2 py-1 rounded border border-slate-600/30">
                         <span className={`text-xs font-semibold ${isEnabled ? 'text-slate-300' : 'text-slate-500'}`}>
                             {isEnabled ? 'Bật' : 'Tắt'}
                         </span>
                         <ToggleInput
                            label=""
                            checked={isEnabled}
                            onChange={(checked) => onToggle(entry.uid!, checked)}
                            aria-label={`Bật/tắt mục ${entry.comment || 'không tên'}`}
                        />
                     </div>
                     
                     {/* Placement Override */}
                     <PlacementControl 
                        value={placement}
                        onChange={(val) => onPlacementChange(entry.uid!, val)}
                     />
                 </div>

                 {/* Pin Button */}
                 <button
                    onClick={() => onPin(entry.uid!, !isPinned)}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1 ${
                        isPinned 
                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm shadow-amber-500/20' 
                        : 'bg-slate-600 hover:bg-slate-500 text-slate-300'
                    }`}
                 >
                    <span aria-hidden="true">📌</span>
                    <span>{isPinned ? 'Đã ghim' : 'Ghim'}</span>
                 </button>
            </div>
        </div>
    );
};

export const WorldInfoManagerModal: React.FC<WorldInfoManagerModalProps> = ({ 
    isOpen, onClose, entries, 
    worldInfoState, worldInfoPinned, worldInfoPlacement,
    onUpdate, onUpdatePinned, onUpdatePlacement 
}) => {
    
    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const triggerElementRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            triggerElementRef.current = document.activeElement as HTMLElement;
            setTimeout(() => {
                closeButtonRef.current?.focus();
            }, 100);

            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    onClose();
                    return;
                }
                if (event.key === 'Tab' && modalRef.current) {
                    const focusableElements = Array.from(
                        modalRef.current.querySelectorAll<HTMLElement>(
                            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                        )
                    ).filter((el: HTMLElement) => el.offsetParent !== null); // Ensure element is visible
                    
                    if (focusableElements.length === 0) return;
                    
                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (event.shiftKey) { // Shift + Tab
                        if (document.activeElement === firstElement) {
                            // @FIX: Explicitly cast to HTMLElement to ensure .focus() is available.
                            (lastElement as HTMLElement).focus();
                            event.preventDefault();
                        }
                    } else { // Tab
                        if (document.activeElement === lastElement) {
                            // @FIX: Explicitly cast to HTMLElement to ensure .focus() is available.
                            (firstElement as HTMLElement).focus();
                            event.preventDefault();
                        }
                    }
                }
            };

            document.addEventListener('keydown', handleKeyDown);
            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                triggerElementRef.current?.focus();
            };
        }
    }, [isOpen, onClose]);

    const handleToggle = (uid: string, isEnabled: boolean) => {
        const newState = { ...worldInfoState, [uid]: isEnabled };
        onUpdate(newState);
    };

    const handlePin = (uid: string, isPinned: boolean) => {
        const newState = { ...worldInfoPinned, [uid]: isPinned };
        onUpdatePinned(newState);
    };

    const handlePlacementChange = (uid: string, val: 'before' | 'after' | undefined) => {
        const newState = { ...worldInfoPlacement, [uid]: val };
        // If undefined, we can delete the key to keep object clean, but usually setting undefined is fine.
        // For cleaner state, let's allow it.
        onUpdatePlacement(newState);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div ref={modalRef} className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-700 flex-shrink-0 bg-slate-900/50 rounded-t-xl">
                    <h2 className="text-xl font-bold text-sky-400">Quản lý World Info Động</h2>
                    <p className="text-sm text-slate-400 mt-1">Kiểm soát trạng thái, ghim và vị trí chèn của các mục World Info.</p>
                </header>
                <main className="p-4 flex-grow overflow-y-auto custom-scrollbar space-y-4 bg-slate-800">
                    {entries.length === 0 ? (
                        <p className="text-slate-500 text-center italic py-10">Nhân vật này không có mục World Info nào.</p>
                    ) : (
                        entries.map(entry => (
                            <WorldInfoItem
                                key={entry.uid}
                                entry={entry}
                                isEnabled={worldInfoState[entry.uid!] ?? (entry.enabled !== false)}
                                isPinned={!!worldInfoPinned[entry.uid!]}
                                placement={worldInfoPlacement[entry.uid!]}
                                onToggle={handleToggle}
                                onPin={handlePin}
                                onPlacementChange={handlePlacementChange}
                            />
                        ))
                    )}
                </main>
                <footer className="p-4 border-t border-slate-700 flex justify-end gap-3 flex-shrink-0 bg-slate-900/50 rounded-b-xl">
                    <button ref={closeButtonRef} onClick={onClose} className="px-6 py-2 text-sm font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors">Đóng</button>
                </footer>
            </div>
        </div>
    );
};

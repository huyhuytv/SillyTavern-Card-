import React, { useState, useEffect, useRef } from 'react';
import type { PromptEntry } from '../types';

// --- Reusable Form Components ---

const LabeledInput: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, value, onChange }) => (
    <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <input
            type="text"
            value={value}
            onChange={onChange}
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
        />
    </div>
);

const LabeledTextarea: React.FC<{ label: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number }> = ({ label, value, onChange, rows = 10 }) => (
    <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <textarea
            value={value}
            onChange={onChange}
            rows={rows}
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
        />
    </div>
);

const ToggleInput: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; }> = ({ label, checked, onChange }) => (
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
);


// --- Main Modal Component ---

interface PromptEditModalProps {
    isOpen: boolean;
    prompt: PromptEntry | null;
    onSave: (updatedPrompt: PromptEntry) => void;
    onClose: () => void;
}

export const PromptEditModal: React.FC<PromptEditModalProps> = ({ isOpen, prompt, onSave, onClose }) => {
    const [editedPrompt, setEditedPrompt] = useState<PromptEntry | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (prompt) {
            setEditedPrompt(JSON.parse(JSON.stringify(prompt))); // Deep copy to avoid mutating state during edit
        } else {
            setEditedPrompt(null);
        }
    }, [prompt, isOpen]);
    
    useEffect(() => {
        if (isOpen) {
            // Focus the close button shortly after the modal opens to ensure it's rendered.
            setTimeout(() => {
                closeButtonRef.current?.focus();
            }, 100);

            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    onClose();
                    return;
                }

                if (event.key === 'Tab' && modalRef.current) {
                    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );

                    if (focusableElements.length === 0) return;

                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (event.shiftKey) { // Shift + Tab
                        if (document.activeElement === firstElement) {
                            lastElement.focus();
                            event.preventDefault();
                        }
                    } else { // Tab
                        if (document.activeElement === lastElement) {
                            firstElement.focus();
                            event.preventDefault();
                        }
                    }
                }
            };

            document.addEventListener('keydown', handleKeyDown);

            return () => {
                document.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen || !editedPrompt) {
        return null;
    }

    const handleChange = (field: keyof PromptEntry, value: any) => {
        setEditedPrompt(prev => prev ? { ...prev, [field]: value } : null);
    };

    const handleSave = () => {
        if (editedPrompt) {
            onSave(editedPrompt);
        }
    };

    return (
        <div 
            className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div 
                ref={modalRef}
                className={`bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transition-transform duration-300 ${isOpen ? 'scale-100' : 'scale-95'}`}
                onClick={e => e.stopPropagation()}
            >
                <header className="p-4 border-b border-slate-700 flex justify-between items-center flex-shrink-0">
                    <h2 id="modal-title" className="text-xl font-bold text-sky-400">Chỉnh sửa Lời nhắc</h2>
                    <button ref={closeButtonRef} onClick={onClose} className="p-1 text-slate-400 hover:text-white" aria-label="Đóng modal">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                <main className="p-6 space-y-4 overflow-y-auto">
                    <LabeledInput 
                        label="Tên Lời nhắc" 
                        value={editedPrompt.name} 
                        onChange={e => handleChange('name', e.target.value)} 
                    />
                    <LabeledTextarea 
                        label="Nội dung" 
                        value={editedPrompt.content} 
                        onChange={e => handleChange('content', e.target.value)} 
                        rows={12} 
                    />
                    <ToggleInput 
                        label="Gửi kèm Tiêu đề" 
                        checked={editedPrompt.include_title ?? false} 
                        onChange={v => handleChange('include_title', v)} 
                    />
                </main>
                <footer className="p-4 border-t border-slate-700 flex justify-end gap-3 flex-shrink-0">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 text-slate-300 bg-slate-700 hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 bg-sky-600 text-white hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                        Lưu Thay đổi
                    </button>
                </footer>
            </div>
        </div>
    );
};
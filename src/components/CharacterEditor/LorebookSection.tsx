
import React, { useState, useId } from 'react';
import type { CharacterCard, Lorebook } from '../../types';
import { Section } from '../ui/Section';

interface LorebookSectionProps {
    card: CharacterCard;
    availableLorebooks: Lorebook[];
    onOpenLorebook: () => void;
    onImport: (bookName: string) => void;
}

export const LorebookSection: React.FC<LorebookSectionProps> = ({ card, availableLorebooks, onOpenLorebook, onImport }) => {
    const lorebookSelectId = useId();
    const [selectedLorebook, setSelectedLorebook] = useState<string>('');

    const entries = card.char_book?.entries || [];
    const enabledEntries = entries.filter(e => e.enabled !== false).length;

    const handleImportClick = () => {
        onImport(selectedLorebook);
        setSelectedLorebook('');
    };

    return (
        <>
            <Section title="Sổ tay Nhân vật (Character Book)" description="Các mục World Info được nhúng trực tiếp vào thẻ này.">
                <div className="col-span-full bg-slate-700/30 rounded-lg p-6 border border-slate-600/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-center sm:text-left">
                        <h4 className="text-lg font-bold text-slate-200">Tổng quan Sổ tay</h4>
                        <p className="text-sm text-slate-400 mt-1">
                            Hiện có <span className="font-mono text-sky-400 font-bold">{entries.length}</span> mục 
                            (<span className="text-green-400">{enabledEntries}</span> Bật / <span className="text-slate-500">{entries.length - enabledEntries}</span> Tắt)
                        </p>
                    </div>
                    <button 
                        onClick={onOpenLorebook}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                        </svg>
                        Mở Trình quản lý Sổ tay (Full Screen)
                    </button>
                </div>
            </Section>

            <Section title="Nhập từ Sổ tay Thế giới" description="Sao chép các mục từ một Sổ tay Thế giới vào Sổ tay Nhân vật của thẻ này.">
                <div className="space-y-4 col-span-full">
                    {availableLorebooks.length > 0 ? (
                        <div className="flex gap-2">
                            <label htmlFor={lorebookSelectId} className="sr-only">Chọn một sổ tay để nhập</label>
                            <select 
                                id={lorebookSelectId}
                                value={selectedLorebook}
                                onChange={e => setSelectedLorebook(e.target.value)}
                                className="flex-grow w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                            >
                                <option value="">Chọn một sổ tay để nhập...</option>
                                {availableLorebooks.map(lb => <option key={lb.name} value={lb.name}>{lb.name}</option>)}
                            </select>
                            <button onClick={handleImportClick} disabled={!selectedLorebook} className="bg-sky-600 hover:bg-sky-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                                Nhập mục
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 italic">Tải lên một Sổ tay Thế giới trong tab 'Sổ tay Thế giới' để nhập các mục của nó.</p>
                    )}
                </div>
            </Section>
        </>
    );
};


import React, { useState, useEffect } from 'react';
import type { WorldInfoEntry } from '../types';
import { CharacterBookEditor } from './CharacterBookEditor';

interface CharacterBookFullScreenViewProps {
    initialEntries: WorldInfoEntry[];
    onClose: () => void;
    onSave: (entries: WorldInfoEntry[]) => void;
    onExport?: () => void; // Tùy chọn: Cho phép xuất file
    onDelete?: () => void; // Tùy chọn: Cho phép xóa file
}

export const CharacterBookFullScreenView: React.FC<CharacterBookFullScreenViewProps> = ({ 
    initialEntries, 
    onClose, 
    onSave,
    onExport,
    onDelete
}) => {
    const [localEntries, setLocalEntries] = useState<WorldInfoEntry[]>([]);

    // Deep copy on mount to ensure isolation (Sandbox Mode)
    useEffect(() => {
        // JSON.parse(JSON.stringify) is a simple deep copy method safe for POJOs (Plain Old JavaScript Objects)
        setLocalEntries(JSON.parse(JSON.stringify(initialEntries)));
    }, [initialEntries]);

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col animate-fade-in-up">
            {/* Full Screen Header */}
            <div className="bg-slate-800 border-b border-slate-700 p-4 flex flex-col md:flex-row justify-between items-center shadow-md z-10 shrink-0 gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Quay lại"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-sky-400 flex items-center gap-2">
                            📖 Quản lý Sổ tay (Editor)
                        </h2>
                        <p className="text-xs text-slate-400">Chế độ chỉnh sửa toàn màn hình - Thay đổi sẽ chỉ được áp dụng khi Lưu.</p>
                    </div>
                </div>
                
                <div className="flex flex-wrap gap-3 justify-end w-full md:w-auto">
                    {/* File Management Actions (Optional) */}
                    {onDelete && (
                        <button 
                            onClick={onDelete}
                            className="px-4 py-2 text-sm font-bold rounded-lg bg-red-900/30 text-red-400 hover:bg-red-600 hover:text-white transition-colors border border-red-900/50 flex items-center gap-2"
                            title="Xóa sổ tay này"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                            <span className="hidden sm:inline">Xóa</span>
                        </button>
                    )}
                    
                    {onExport && (
                        <button 
                            onClick={onExport}
                            className="px-4 py-2 text-sm font-bold rounded-lg bg-green-900/30 text-green-400 hover:bg-green-600 hover:text-white transition-colors border border-green-900/50 flex items-center gap-2"
                            title="Xuất ra file JSON"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            <span className="hidden sm:inline">Xuất</span>
                        </button>
                    )}

                    <div className="w-px h-8 bg-slate-700 mx-1 hidden sm:block"></div>

                    <button 
                        onClick={onClose} 
                        className="px-5 py-2 text-sm font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors border border-slate-600"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={() => { onSave(localEntries); }} 
                        className="px-6 py-2 text-sm font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-lg shadow-sky-900/20 flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        Lưu & Áp dụng
                    </button>
                </div>
            </div>

            {/* Full Screen Body */}
            <div className="flex-grow overflow-hidden bg-slate-900 relative">
                <div className="absolute inset-0 p-4 sm:p-6 overflow-hidden">
                    <div className="max-w-7xl mx-auto h-full flex flex-col">
                        <CharacterBookEditor 
                            entries={localEntries} 
                            onUpdate={setLocalEntries} 
                            className="h-full"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

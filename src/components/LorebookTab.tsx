
import React, { useState, useRef } from 'react';
import type { Lorebook, WorldInfoEntry } from '../types';
import { Loader } from './Loader';
import { useLorebook } from '../contexts/LorebookContext';
import { exportLorebookToJson } from '../services/lorebookExporter';
import { CharacterBookFullScreenView } from './CharacterBookFullScreenView';
import { ExportModal } from './ExportModal';

// --- Card Component cho mỗi Lorebook ---
const LorebookCard: React.FC<{
    lorebook: Lorebook;
    onClick: () => void;
}> = ({ lorebook, onClick }) => {
    const entryCount = lorebook.book?.entries?.length || 0;
    
    return (
        <div 
            onClick={onClick}
            className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-sky-500/50 hover:bg-slate-750 hover:shadow-lg hover:shadow-sky-900/10 transition-all cursor-pointer group flex flex-col h-full"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="bg-slate-700/50 p-3 rounded-lg group-hover:bg-sky-900/20 group-hover:text-sky-400 transition-colors text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </div>
                <span className="text-xs font-mono bg-slate-900 text-slate-400 px-2 py-1 rounded border border-slate-700">
                    {entryCount} mục
                </span>
            </div>
            
            <h3 className="text-lg font-bold text-slate-200 group-hover:text-sky-400 transition-colors mb-2 line-clamp-2" title={lorebook.name}>
                {lorebook.name}
            </h3>
            
            <div className="mt-auto pt-4 flex items-center text-sm text-slate-500 group-hover:text-slate-300 transition-colors gap-2">
                <span>Nhấn để chỉnh sửa</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </div>
        </div>
    );
};

const UploadCard: React.FC<{
    onUpload: () => void;
    isLoading: boolean;
}> = ({ onUpload, isLoading }) => (
    <div 
        onClick={!isLoading ? onUpload : undefined}
        className={`border-2 border-dashed border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center text-center h-full min-h-[200px] transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-sky-500/50 hover:bg-slate-800/30 cursor-pointer group'}`}
    >
        <div className="bg-slate-800 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
            {isLoading ? (
                <Loader message="" />
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            )}
        </div>
        <h3 className="text-base font-bold text-slate-300 group-hover:text-white transition-colors">Tải lên Sổ tay Mới</h3>
        <p className="text-xs text-slate-500 mt-1">Hỗ trợ định dạng JSON</p>
    </div>
);

export const LorebookTab: React.FC = () => {
    const {
        lorebooks,
        isLoading,
        error,
        loadLorebooks,
        updateLorebook,
        deleteLorebook
    } = useLorebook();
    
    const [editingLorebookName, setEditingLorebookName] = useState<string | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            loadLorebooks(e.target.files);
            e.target.value = '';
        }
    };

    const activeLorebook = lorebooks.find(lb => lb.name === editingLorebookName);

    const handleSave = (updatedEntries: WorldInfoEntry[]) => {
        if (!activeLorebook) return;
        const updatedBook: Lorebook = {
            ...activeLorebook,
            book: {
                ...activeLorebook.book,
                entries: updatedEntries
            }
        };
        updateLorebook(updatedBook);
        setEditingLorebookName(null);
    };

    const handleExportClick = () => {
        if (!activeLorebook) return;
        setIsExportModalOpen(true);
    };

    const performExport = (filename: string) => {
        if (!activeLorebook) return;
        exportLorebookToJson(activeLorebook, filename);
    };

    const handleDelete = () => {
        if (!activeLorebook) return;
        if (window.confirm(`Bạn có chắc chắn muốn xóa sổ tay "${activeLorebook.name}" không? Hành động này không thể hoàn tác.`)) {
            deleteLorebook(activeLorebook.name);
            setEditingLorebookName(null);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">Thư viện Sổ tay Thế giới</h2>
                <p className="text-slate-400">Quản lý kiến thức nền, sự kiện và thông tin bổ sung cho thế giới của bạn.</p>
            </div>

            {error && (
                <div className="bg-red-900/30 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    {error}
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".json"
                onChange={handleFileChange}
                multiple
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-10">
                {/* Upload Button Card */}
                <UploadCard onUpload={() => fileInputRef.current?.click()} isLoading={isLoading} />

                {/* Existing Lorebooks */}
                {lorebooks.map(lb => (
                    <LorebookCard 
                        key={lb.name} 
                        lorebook={lb} 
                        onClick={() => setEditingLorebookName(lb.name)} 
                    />
                ))}
            </div>

            {/* Unified Full Screen Editor */}
            {activeLorebook && (
                <CharacterBookFullScreenView 
                    initialEntries={activeLorebook.book.entries || []}
                    onSave={handleSave}
                    onClose={() => setEditingLorebookName(null)}
                    onExport={handleExportClick}
                    onDelete={handleDelete}
                />
            )}

            <ExportModal 
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onConfirm={performExport}
                initialFileName={activeLorebook?.name || 'Lorebook'}
                title="Xuất Sổ tay Thế giới"
                fileExtension=".json"
            />
        </div>
    );
};

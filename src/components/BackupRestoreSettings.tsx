
import React, { useState, useRef } from 'react';
import { createFullSystemBackup, restoreFullSystemBackup } from '../services/snapshotService';
import { Loader } from './Loader';
import { useToast } from './ToastSystem';
import { useCharacter } from '../contexts/CharacterContext';
import { usePreset } from '../contexts/PresetContext';
import { useLorebook } from '../contexts/LorebookContext';
import { useUserPersona } from '../contexts/UserPersonaContext';

export const BackupRestoreSettings: React.FC = () => {
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    // Import Reload Functions from Contexts
    const { reloadCharacters } = useCharacter();
    const { reloadPresets } = usePreset();
    const { reloadLorebooks } = useLorebook();
    const { reloadPersonas } = useUserPersona();

    // HANDLE BACKUP
    const handleBackup = async () => {
        setIsBackingUp(true);
        try {
            const file = await createFullSystemBackup();
            
            // Mobile Native Share
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'SillyTavern Card Studio Backup',
                        text: 'Full system backup file.',
                    });
                    showToast("Đã mở menu chia sẻ!", 'success');
                } catch (shareError) {
                    if ((shareError as Error).name !== 'AbortError') {
                        // If share fails, fallback to download
                        downloadFile(file);
                    }
                }
            } else {
                // Desktop Download
                downloadFile(file);
            }
        } catch (e) {
            showToast(`Lỗi sao lưu: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setIsBackingUp(false);
        }
    };

    const downloadFile = (file: File) => {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Đã tải xuống file sao lưu.", 'success');
    };

    // HANDLE RESTORE
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        
        // REMOVED: window.confirm due to sandbox restrictions
        // Proceeding directly with restore

        setIsRestoring(true);
        try {
            // 1. Perform DB Restoration
            await restoreFullSystemBackup(file);
            
            // 2. Trigger Context Refreshes (Crucial for UI Update)
            await Promise.all([
                reloadCharacters(),
                reloadPresets(),
                reloadLorebooks(),
                reloadPersonas()
            ]);

            showToast("Khôi phục thành công! Dữ liệu đã được cập nhật.", 'success');
            
        } catch (e) {
            console.error(e);
            showToast(`Lỗi khôi phục: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            e.target.value = ''; // Reset input
            setIsRestoring(false);
        }
    };

    return (
        <div className="bg-slate-800/50 p-6 rounded-xl shadow-lg max-w-3xl mx-auto space-y-8 animate-fade-in-up">
            <div className="border-b border-slate-700 pb-4">
                <h3 className="text-xl font-bold text-sky-400 mb-2 flex items-center gap-2">
                    <span className="text-2xl">💾</span> Sao lưu & Khôi phục Hệ thống
                </h3>
                <p className="text-slate-400 text-sm">
                    Quản lý toàn bộ dữ liệu của ứng dụng. Bạn có thể sao lưu tất cả (Nhân vật, Chat, Preset, Lorebook) vào một tệp duy nhất để chuyển sang thiết bị khác hoặc lưu trữ an toàn.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* BACKUP SECTION */}
                <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 flex flex-col items-center text-center hover:border-sky-500/50 transition-colors">
                    <div className="w-16 h-16 bg-sky-900/30 text-sky-400 rounded-full flex items-center justify-center mb-4 text-3xl">
                        📤
                    </div>
                    <h4 className="text-lg font-bold text-slate-200 mb-2">Sao Lưu Toàn Bộ</h4>
                    <p className="text-xs text-slate-500 mb-6 px-4">
                        Gom tất cả dữ liệu hiện có thành một tệp <code>.json</code> duy nhất. Hỗ trợ chia sẻ trực tiếp trên điện thoại.
                    </p>
                    <button
                        onClick={handleBackup}
                        disabled={isBackingUp}
                        className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-lg shadow-sky-900/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isBackingUp ? <Loader message="Đang xử lý..." /> : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                Sao Lưu Ngay
                            </>
                        )}
                    </button>
                </div>

                {/* RESTORE SECTION */}
                <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 flex flex-col items-center text-center hover:border-emerald-500/50 transition-colors">
                    <div className="w-16 h-16 bg-emerald-900/30 text-emerald-400 rounded-full flex items-center justify-center mb-4 text-3xl">
                        📥
                    </div>
                    <h4 className="text-lg font-bold text-slate-200 mb-2">Khôi Phục Dữ Liệu</h4>
                    <p className="text-xs text-slate-500 mb-6 px-4">
                        Nhập tệp sao lưu <code>FullBackup_....json</code>. <span className="text-amber-400">Lưu ý: Dữ liệu trùng tên sẽ bị ghi đè.</span>
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <button
                        onClick={() => !isRestoring && fileInputRef.current?.click()}
                        disabled={isRestoring}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg shadow-emerald-900/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isRestoring ? <Loader message="Đang xử lý..." /> : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                Chọn Tệp Khôi Phục
                            </>
                        )}
                    </button>
                </div>
            </div>
            
            <div className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-lg text-sm text-amber-200 flex gap-3 items-start">
                <span className="text-xl">⚠️</span>
                <div>
                    <strong>Lưu ý quan trọng:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-1 opacity-90 text-xs">
                        <li>File sao lưu chứa TOÀN BỘ dữ liệu. Hãy bảo mật file này.</li>
                        <li>Khi khôi phục, dữ liệu mới sẽ được nạp ngay lập tức vào ứng dụng.</li>
                        <li>Nếu bạn đang ở trong một cuộc trò chuyện, vui lòng quay lại sảnh chính để thấy danh sách cập nhật.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

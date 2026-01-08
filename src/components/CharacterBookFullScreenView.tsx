
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { WorldInfoEntry } from '../types';
import { CharacterBookEditor } from './CharacterBookEditor';
import { translateLorebookBatch } from '../services/translationService'; // UPDATED IMPORT
import { exportLorebookToJson } from '../services/lorebookExporter'; 
import { MODEL_OPTIONS } from '../services/settingsService';
import { useToast } from './ToastSystem';
import _ from 'lodash';

// --- DEFAULT TRANSLATE PROMPT ---
const DEFAULT_TRANSLATE_PROMPT = `Bạn là một dịch giả chuyên nghiệp, chuyên dịch Lorebook (Sổ tay thế giới) từ tiếng Trung/Anh sang tiếng Việt cho các trò chơi nhập vai (RPG). Bạn am hiểu sâu sắc các thuật ngữ Hán-Việt (cho bối cảnh Tiên hiệp/Kiếm hiệp) và thuật ngữ Fantasy phương Tây.

NHIỆM VỤ CỦA BẠN:
Xử lý dữ liệu JSON đầu vào và trả về định dạng JSON hợp lệ với các quy tắc sau:

1. QUY TẮC DỊCH THUẬT:
   - QUAN TRỌNG: Kiểm tra ngôn ngữ nguồn của từng trường. Nếu nội dung trong "comment" hoặc "content" ĐÃ LÀ TIẾNG VIỆT, hãy giữ nguyên bản gốc tuyệt đối, không dịch lại hay chỉnh sửa văn phong.
   - Chỉ dịch các nội dung chưa phải tiếng Việt theo hướng dẫn sau:
     + TRƯỜNG "comment" (Tiêu đề): Dịch sang tiếng Việt ngắn gọn, súc tích, văn phong giả tưởng (Fantasy/Huyền ảo).
     + TRƯỜNG "content" (Nội dung): Dịch sang tiếng Việt mượt mà, thoát ý, phù hợp bối cảnh game.
       * Nếu nguồn là tiếng Trung: Ưu tiên dùng từ Hán-Việt đắt giá (Ví dụ: "Sect" -> "Tông môn", không dịch là "Giáo phái" nếu không phù hợp).
       * GIỮ NGUYÊN tuyệt đối các từ khóa trong dấu ngoặc {{...}}, các biến số, và các thẻ HTML/XML (như <br>, <b>).

2. QUY TẮC XỬ LÝ TỪ KHÓA ("keys"):
   - Giữ nguyên các từ khóa gốc.
   - Dịch các từ khóa tiếng nước ngoài sang tiếng Việt và THÊM VÀO mảng.
   - Nếu từ khóa gốc đã là tiếng Việt thì giữ nguyên, không cần thêm.
   - Đảm bảo không có từ khóa trùng lặp trong mảng kết quả.

3. QUY TẮC ĐỊNH DẠNG JSON (QUAN TRỌNG):
   - Đảm bảo cấu trúc JSON hoàn toàn hợp lệ (RFC 8259).
   - Các ký tự đặc biệt trong chuỗi (như dấu ngoặc kép ", dấu gạch chéo \\) PHẢI được escape đúng cách (ví dụ: \\" thay vì ").
   - Chỉ trả về duy nhất chuỗi JSON mảng kết quả. Không kèm theo lời dẫn, giải thích hay markdown code block (\`\`\`).

DỮ LIỆU CẦN XỬ LÝ:
{{json_data}}`;

interface CharacterBookFullScreenViewProps {
    initialEntries: WorldInfoEntry[];
    onClose: () => void;
    onSave: (entries: WorldInfoEntry[]) => void;
    onExport?: () => void; 
    onDelete?: () => void; 
}

interface Batch {
    id: number;
    entries: WorldInfoEntry[];
    status: 'pending' | 'processing' | 'success' | 'error';
    error?: string;
    debugInfo?: {
        prompt: string;
        response: string;
    };
}

// --- Translate Modal Component ---
const TranslateModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    totalEntries: number;
    onStart: (settings: { batchSize: number; prompt: string; concurrency: number; model: string }) => void;
    
    // Status Props
    isProcessing: boolean;
    queue: Batch[];
    activeWorkers: number;
    onRetryFailed: (retryModel: string) => void;
    onStop: () => void;
}> = ({ isOpen, onClose, totalEntries, onStart, isProcessing, queue, activeWorkers, onRetryFailed, onStop }) => {
    const [prompt, setPrompt] = useState(DEFAULT_TRANSLATE_PROMPT);
    const [batchSize, setBatchSize] = useState(20);
    const [concurrency, setConcurrency] = useState(3);
    const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
    // New state for retry model selection
    const [retryModel, setRetryModel] = useState('gemini-3-pro-preview'); 
    
    const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

    const activeBatchInfo = queue.find(b => b.id === selectedBatchId);

    // Sync retry model with initial selection initially
    useEffect(() => {
        if (!isProcessing && queue.length === 0) {
            setRetryModel(selectedModel);
        }
    }, [selectedModel, isProcessing, queue.length]);

    if (!isOpen) return null;

    const totalBatches = queue.length;
    const completedBatches = queue.filter(b => b.status === 'success').length;
    const errorBatches = queue.filter(b => b.status === 'error').length;
    // Calculate list of failed batch IDs for display
    const failedBatchIds = queue.filter(b => b.status === 'error').map(b => b.id).join(', ');
    
    const progressPercent = totalBatches > 0 ? Math.round((completedBatches / totalBatches) * 100) : 0;

    return (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-sky-400 flex items-center gap-2">
                        <span>🌐</span> Dịch Sổ tay Tự động (AI)
                    </h3>
                    {!isProcessing && queue.length === 0 && (
                        <button 
                            onClick={onClose} 
                            className="text-slate-400 hover:text-white"
                            aria-label="Đóng cửa sổ dịch"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-grow">
                    {/* MODE 1: CONFIGURATION (Queue is empty) */}
                    {queue.length === 0 ? (
                        <>
                            <div className="bg-amber-900/20 border border-amber-500/30 p-3 rounded-lg text-sm text-amber-200">
                                <p className="font-bold mb-1">⚠️ Cảnh báo quan trọng:</p>
                                <ul className="list-disc list-inside space-y-1 text-xs opacity-90">
                                    <li>Hành động này sẽ <strong>GHI ĐÈ</strong> nội dung của {totalEntries} mục đang BẬT.</li>
                                    <li>Hệ thống sẽ <strong>tự động tải xuống bản sao lưu</strong> trước khi bắt đầu.</li>
                                    <li>Đã kích hoạt chế độ <strong>Structured Output (Schema)</strong> để giảm thiểu lỗi JSON.</li>
                                </ul>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Mô hình AI:
                                    </label>
                                    <select 
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="w-full bg-slate-700 border border-slate-600 rounded-lg p-2 text-slate-200 focus:ring-1 focus:ring-sky-500"
                                    >
                                        {MODEL_OPTIONS.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1">Chọn mô hình mạnh hơn nếu bản Flash hay lỗi.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Kích thước gói (Batch Size): <span className="text-sky-400 font-bold">{batchSize}</span>
                                    </label>
                                    <input 
                                        type="range" 
                                        min="5" 
                                        max="50" 
                                        step="5" 
                                        value={batchSize} 
                                        onChange={(e) => setBatchSize(parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Số mục/lần gửi. Nếu hay lỗi JSON, hãy GIẢM xuống.</p>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Số luồng xử lý (Concurrency): <span className="text-sky-400 font-bold">{concurrency}</span>
                                    </label>
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="5" 
                                        step="1" 
                                        value={concurrency} 
                                        onChange={(e) => setConcurrency(parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Số lượng gói gửi song song. Cẩn thận Rate Limit.</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Lời nhắc Hệ thống (System Prompt):
                                </label>
                                <div className="relative">
                                    <textarea 
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        rows={8}
                                        className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 text-xs font-mono text-slate-300 focus:ring-1 focus:ring-sky-500"
                                    />
                                    <div className="absolute top-2 right-2 text-[10px] text-slate-500 bg-slate-800/80 px-2 py-1 rounded">
                                        {'{{json_data}}'} là bắt buộc
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* MODE 2: EXECUTION DASHBOARD (Queue exists) */
                        <div className="flex flex-col h-full gap-4">
                            {/* Stats Header */}
                            <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700">
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-bold">Tiến độ tổng thể</p>
                                    <p className="text-lg font-mono font-bold text-slate-200">
                                        {progressPercent}% <span className="text-sm font-normal text-slate-500">({completedBatches}/{totalBatches} gói)</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-400 uppercase font-bold">Luồng hoạt động</p>
                                    <p className={`text-lg font-mono font-bold ${activeWorkers > 0 ? 'text-green-400 animate-pulse' : 'text-slate-500'}`}>
                                        {activeWorkers} / {concurrency}
                                    </p>
                                </div>
                            </div>

                            {/* Grid Visualization */}
                            <div className="flex-grow bg-slate-900/30 rounded-lg p-4 border border-slate-800 overflow-y-auto min-h-[150px]">
                                <p className="text-xs text-slate-500 mb-2 flex gap-4">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600"></span> Chờ</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Đang chạy</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Xong</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Lỗi</span>
                                </p>
                                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                                    {queue.map((batch) => (
                                        <button 
                                            key={batch.id}
                                            onClick={() => setSelectedBatchId(batch.id)}
                                            title={`Gói #${batch.id}: ${batch.entries.length} mục${batch.error ? `\nLỗi: ${batch.error}` : ''}`}
                                            className={`
                                                aspect-square rounded flex items-center justify-center text-xs font-bold transition-all duration-300 border focus:outline-none focus:ring-2 focus:ring-white/50
                                                ${selectedBatchId === batch.id ? 'ring-2 ring-white scale-110 z-10' : ''}
                                                ${batch.status === 'pending' ? 'bg-slate-700 text-slate-400 border-slate-600' : ''}
                                                ${batch.status === 'processing' ? 'bg-amber-600/20 text-amber-400 border-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.3)]' : ''}
                                                ${batch.status === 'success' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500' : ''}
                                                ${batch.status === 'error' ? 'bg-red-600/20 text-red-400 border-red-500 hover:bg-red-600/40' : ''}
                                            `}
                                        >
                                            {batch.id}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* DEBUG PANEL (Visible when a batch is selected) */}
                            {activeBatchInfo && (
                                <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 animate-fade-in-up flex flex-col gap-2 max-h-[300px]">
                                    <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                                        <span className="text-xs font-bold text-sky-400">🔍 Chi tiết Gói #{activeBatchInfo.id}</span>
                                        <button 
                                            onClick={() => setSelectedBatchId(null)} 
                                            className="text-slate-500 hover:text-white"
                                            aria-label="Đóng chi tiết"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <div className="flex-grow overflow-hidden flex flex-col gap-2 text-xs">
                                        <div className="flex gap-2 h-full">
                                            <div className="flex-1 flex flex-col min-w-0">
                                                <span className="font-bold text-slate-500 mb-1">📤 Outgoing Prompt (Gửi đi)</span>
                                                <div className="bg-black/30 rounded p-2 overflow-y-auto custom-scrollbar font-mono text-slate-400 flex-grow border border-slate-800">
                                                    {activeBatchInfo.debugInfo?.prompt || "(Đang chờ...)"}
                                                </div>
                                            </div>
                                            <div className="flex-1 flex flex-col min-w-0">
                                                <span className="font-bold text-slate-500 mb-1">📥 Raw Response (Phản hồi thô)</span>
                                                <div className={`bg-black/30 rounded p-2 overflow-y-auto custom-scrollbar font-mono flex-grow border border-slate-800 ${activeBatchInfo.status === 'error' ? 'text-red-300' : 'text-green-300'}`}>
                                                    {activeBatchInfo.error ? `LỖI: ${activeBatchInfo.error}\n\n` : ''}
                                                    {activeBatchInfo.debugInfo?.response || "(Đang chờ...)"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Error Summary & Retry Control */}
                            {errorBatches > 0 && (
                                <div className="bg-red-900/20 border border-red-500/30 p-3 rounded-lg flex flex-col gap-3 animate-shake">
                                    <div className="text-red-300 text-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold">⚠️ Có {errorBatches} gói bị lỗi!</span>
                                            <span className="text-xs opacity-90">ID: {failedBatchIds}</span>
                                        </div>
                                        <p className="text-xs opacity-80 mt-1">Các gói này có thể chứa nội dung phức tạp. Bạn có thể thử lại với model mạnh hơn.</p>
                                    </div>
                                    
                                    {!isProcessing && (
                                        <div className="flex gap-2 items-center bg-red-950/30 p-2 rounded-lg border border-red-900/50">
                                            <div className="flex-grow">
                                                <label className="block text-xs font-bold text-red-200 mb-1">Chọn Model để Thử lại:</label>
                                                <select 
                                                    value={retryModel}
                                                    onChange={(e) => setRetryModel(e.target.value)}
                                                    className="w-full bg-slate-800 border border-slate-600 rounded p-1.5 text-xs text-white focus:ring-1 focus:ring-red-500"
                                                >
                                                    {MODEL_OPTIONS.map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button 
                                                onClick={() => onRetryFailed(retryModel)}
                                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded shadow-lg transition-colors flex items-center gap-1 self-end h-[34px]"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
                                                Thử lại
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3">
                    {queue.length === 0 ? (
                        <>
                            <button 
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                            >
                                Hủy
                            </button>
                            <button 
                                onClick={() => onStart({ batchSize, prompt, concurrency, model: selectedModel })}
                                disabled={totalEntries === 0}
                                className="px-6 py-2 text-sm font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <span>🚀</span> Bắt đầu Dịch ({totalEntries} mục)
                            </button>
                        </>
                    ) : (
                        <>
                            {isProcessing ? (
                                <button 
                                    onClick={onStop}
                                    className="px-4 py-2 text-sm font-bold rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-800 transition-colors"
                                >
                                    Dừng lại
                                </button>
                            ) : (
                                <button 
                                    onClick={onClose}
                                    className="px-6 py-2 text-sm font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                                >
                                    Đóng
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export const CharacterBookFullScreenView: React.FC<CharacterBookFullScreenViewProps> = ({ 
    initialEntries, 
    onClose, 
    onSave,
    onExport,
    onDelete
}) => {
    const [localEntries, setLocalEntries] = useState<WorldInfoEntry[]>([]);
    const [isTranslateModalOpen, setIsTranslateModalOpen] = useState(false);
    
    // --- TRANSLATION QUEUE STATE ---
    const [queue, setQueue] = useState<Batch[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeWorkers, setActiveWorkers] = useState(0);
    
    // Config Refs
    const configRef = useRef({ prompt: '', concurrency: 3, model: 'gemini-3-flash-preview' });
    const isStoppedRef = useRef(false);
    
    const { showToast } = useToast();

    // Deep copy on mount to ensure isolation (Sandbox Mode)
    useEffect(() => {
        setLocalEntries(JSON.parse(JSON.stringify(initialEntries)));
    }, [initialEntries]);

    const handleSave = () => {
        const entriesToSave = localEntries
            .filter(e => !e.__deleted)
            .map(e => {
                const { __deleted, ...rest } = e;
                return rest;
            });
        
        onSave(entriesToSave);
    };

    // --- BATCH PROCESSING LOGIC ---

    const processQueueStep = useCallback(async () => {
        // If stopped or max concurrency reached, do nothing
        if (isStoppedRef.current) return;
        
        setQueue(currentQueue => {
            const running = currentQueue.filter(b => b.status === 'processing').length;
            if (running >= configRef.current.concurrency) return currentQueue;

            // Find next pending
            const nextIdx = currentQueue.findIndex(b => b.status === 'pending');
            if (nextIdx === -1) {
                // No more pending. If also no running, mark as done.
                if (running === 0) setIsProcessing(false);
                return currentQueue;
            }

            // Mark as processing
            const newQueue = [...currentQueue];
            newQueue[nextIdx] = { ...newQueue[nextIdx], status: 'processing' };
            
            // Trigger Async Worker
            const batchToProcess = newQueue[nextIdx];
            
            // Fire and forget worker (it updates state on finish)
            (async () => {
                setActiveWorkers(prev => prev + 1);
                try {
                    const { entries: translatedChunk, rawResponse, finalPrompt } = await translateLorebookBatch(
                        batchToProcess.entries, 
                        configRef.current.prompt,
                        configRef.current.model
                    );
                    
                    // 1. Update Main Entries Data
                    setLocalEntries(prevEntries => {
                        const newEntries = [...prevEntries];
                        translatedChunk.forEach((translatedItem: any) => {
                            const index = newEntries.findIndex(e => e.uid === translatedItem.uid);
                            if (index !== -1) {
                                newEntries[index] = {
                                    ...newEntries[index],
                                    comment: translatedItem.comment || newEntries[index].comment,
                                    content: translatedItem.content || newEntries[index].content,
                                    keys: translatedItem.keys || newEntries[index].keys,
                                };
                            }
                        });
                        return newEntries;
                    });

                    // 2. Update Queue Status (Success)
                    setQueue(q => q.map(b => b.id === batchToProcess.id ? { 
                        ...b, 
                        status: 'success', 
                        debugInfo: { prompt: finalPrompt, response: rawResponse } 
                    } : b));

                } catch (error: any) {
                    console.error(`Batch ${batchToProcess.id} failed:`, error);
                    // 2. Update Queue Status (Error)
                    setQueue(q => q.map(b => b.id === batchToProcess.id ? { 
                        ...b, 
                        status: 'error', 
                        // Use structured error properties if available
                        error: error.message || String(error),
                        debugInfo: {
                            prompt: error.finalPrompt || "(Không có dữ liệu lời nhắc)",
                            response: error.rawResponse || "(Không có phản hồi từ AI)"
                        }
                    } : b));
                } finally {
                    setActiveWorkers(prev => prev - 1);
                    // Trigger next step
                    processQueueStep();
                }
            })();

            return newQueue;
        });
    }, []);

    // Watcher to keep feeding the queue if workers free up
    useEffect(() => {
        if (isProcessing && !isStoppedRef.current) {
            processQueueStep();
        }
    }, [isProcessing, activeWorkers, processQueueStep]); // Re-run when workers decrement

    const handleTranslateStart = async ({ batchSize, prompt, concurrency, model }: { batchSize: number; prompt: string; concurrency: number; model: string }) => {
        // 1. Auto Backup
        try {
            const backupBook = { entries: localEntries };
            exportLorebookToJson({ name: `Backup_PreTranslate_${Date.now()}.json`, book: backupBook }, `Backup_PreTranslate_${Date.now()}.json`);
            showToast("Đã tải xuống bản sao lưu an toàn.", 'info');
        } catch (e) {
            console.error("Backup failed", e);
        }

        // 2. Prepare Batches
        const targetEntries = localEntries.filter(e => e.enabled !== false && !e.__deleted);
        const chunks = _.chunk(targetEntries, batchSize);
        
        const newQueue: Batch[] = chunks.map((chunk, idx) => ({
            id: idx + 1,
            entries: chunk,
            status: 'pending'
        }));

        // 3. Init State
        setQueue(newQueue);
        configRef.current = { prompt, concurrency, model };
        isStoppedRef.current = false;
        setIsProcessing(true);
        setActiveWorkers(0);
        
        // Kickoff is handled by useEffect when isProcessing becomes true
    };

    const handleRetryFailed = (retryModel: string) => {
        // Update model for retries
        if (retryModel) {
            configRef.current.model = retryModel;
        }
        
        setQueue(currentQueue => currentQueue.map(b => {
            if (b.status === 'error') {
                return { ...b, status: 'pending', error: undefined };
            }
            return b;
        }));
        isStoppedRef.current = false;
        setIsProcessing(true);
    };

    const handleStop = () => {
        isStoppedRef.current = true;
        setIsProcessing(false);
        showToast("Đã gửi lệnh dừng. Các tiến trình đang chạy sẽ hoàn tất.", 'warning');
    };

    const enabledCount = localEntries.filter(e => e.enabled !== false && !e.__deleted).length;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col animate-fade-in-up">
            {/* Full Screen Header */}
            <div className="bg-slate-800 border-b border-slate-700 p-4 flex flex-col md:flex-row justify-between items-center shadow-md z-10 shrink-0 gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Quay lại"
                        aria-label="Quay lại"
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
                
                <div className="flex flex-wrap gap-3 justify-end w-full md:w-auto items-center">
                    
                    {/* Translate Button */}
                    <button
                        onClick={() => setIsTranslateModalOpen(true)}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 transition-all flex items-center gap-2"
                        title="Dịch tự động sang Tiếng Việt"
                    >
                        <span>🌐</span> Dịch AI
                    </button>

                    <div className="w-px h-6 bg-slate-700 mx-1 hidden sm:block"></div>

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
                        onClick={handleSave} 
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

            {/* Translation Modal */}
            <TranslateModal 
                isOpen={isTranslateModalOpen}
                onClose={() => setIsTranslateModalOpen(false)}
                totalEntries={enabledCount}
                onStart={handleTranslateStart}
                isProcessing={isProcessing}
                queue={queue}
                activeWorkers={activeWorkers}
                onRetryFailed={handleRetryFailed}
                onStop={handleStop}
                onCancel={() => {
                    handleStop();
                    setIsTranslateModalOpen(false);
                }}
            />
        </div>
    );
};

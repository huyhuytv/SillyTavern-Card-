
import React, { useState, useMemo, useCallback, useRef } from 'react';
import type { CharacterCard, EnhancementField, WorldInfoEntry } from '../types';
import { analyzeCard, enhanceField } from '../services/geminiService';
import { exportToPng, buildExportObject } from '../services/cardExporter';
import { Loader } from './Loader';
import { useLorebook } from '../contexts/LorebookContext';
import { ExportModal } from './ExportModal';

interface AnalysisPaneProps {
  card: CharacterCard;
  onUpdate: (card: CharacterCard) => void;
  fileName: string;
  avatarUrl: string | null;
  avatarFile: File | null;
  setAvatarUrl: (url: string | null) => void;
  setAvatarFile: (file: File | null) => void;
  onOpenArchitect: () => void; // NEW PROP
}

const estimateTokens = (text: string = ''): number => {
    if(!text) return 0;
    return Math.ceil(text.length / 4);
};

const enhancementFieldLabels: Record<EnhancementField, string> = {
    description: 'mô tả',
    personality: 'tính cách',
    first_mes: 'lời chào đầu',
    mes_example: 'ví dụ hội thoại',
};

export const AnalysisPane: React.FC<AnalysisPaneProps> = ({ card, onUpdate, fileName, avatarUrl, avatarFile, setAvatarUrl, setAvatarFile, onOpenArchitect }) => {
    const { lorebooks } = useLorebook();
    const [analysisResult, setAnalysisResult] = useState<string>('');
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [isEnhancing, setIsEnhancing] = useState<EnhancementField | null>(null);
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const avatarInputRef = useRef<HTMLInputElement>(null);

    // Export Modal State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportType, setExportType] = useState<'json' | 'png'>('json');

    const assembleCompleteCard = useCallback((characterCard: CharacterCard): CharacterCard => {
      if (!characterCard) return characterCard;

      // Deep copy to avoid mutating state
      const completeCard = JSON.parse(JSON.stringify(characterCard)) as CharacterCard;
      
      // The new logic is much simpler: all relevant entries are already in char_book.
      // We check and remove the book if it has no entries.
      if (completeCard.char_book && completeCard.char_book.entries.length === 0) {
          delete completeCard.char_book;
      }
      
      // Still good practice to remove the attached_lorebooks field for older cards.
      delete completeCard.attached_lorebooks;

      return completeCard;
    }, []);


    const tokenCounts = useMemo(() => {
        const description = estimateTokens(card.description);
        const personality = estimateTokens(card.personality);
        const first_mes = estimateTokens(card.first_mes);
        const mes_example = estimateTokens(card.mes_example);
        const total = description + personality + first_mes + mes_example;
        return { description, personality, first_mes, mes_example, total };
    }, [card]);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setError('');
        setAnalysisResult('');
        try {
            const completeCard = assembleCompleteCard(card);
            const result = await analyzeCard(completeCard);
            setAnalysisResult(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Đã xảy ra lỗi không xác định trong quá trình phân tích.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleEnhance = useCallback(async (field: EnhancementField) => {
        setIsEnhancing(field);
        setError('');
        try {
            const completeCardContext = assembleCompleteCard(card);
            const currentContent = card[field];
            const enhancedContent = await enhanceField(field, currentContent, completeCardContext);
            onUpdate({ ...card, [field]: enhancedContent });
        } catch(e) {
            const fieldName = enhancementFieldLabels[field] || field;
            setError(e instanceof Error ? `Không thể cải thiện ${fieldName}: ${e.message}` : 'Đã xảy ra một lỗi không xác định');
        } finally {
            setIsEnhancing(null);
        }
    }, [card, onUpdate, assembleCompleteCard]);

    // Opens the modal
    const handleExportClick = (type: 'json' | 'png') => {
        setExportType(type);
        setIsExportModalOpen(true);
    };

    // Executes the export after name confirmation
    const performExport = async (finalFileName: string) => {
        if (exportType === 'json') {
            const cardToExport = assembleCompleteCard(card);
            const exportObject = buildExportObject(cardToExport);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", finalFileName);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } else {
            if (!card || !avatarFile) return;
            setIsExporting(true);
            setError('');
            try {
                const cardToExport = assembleCompleteCard(card);
                await exportToPng(cardToExport, avatarFile, finalFileName);
            } catch (e) {
                setError(e instanceof Error ? `Lỗi xuất PNG: ${e.message}` : 'Đã xảy ra lỗi không xác định khi xuất tệp PNG.');
            } finally {
                setIsExporting(false);
            }
        }
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if(avatarUrl) URL.revokeObjectURL(avatarUrl);
            setAvatarUrl(URL.createObjectURL(file));
            setAvatarFile(file);
        }
    };

    return (
        <div className="bg-slate-800/50 p-6 rounded-xl shadow-lg h-full space-y-6 flex flex-col">
            <div className="flex-grow space-y-6">
                <div>
                    <h3 className="text-xl font-bold text-sky-400 mb-2">Phân tích & Cải tiến</h3>
                    <p className="text-sm text-slate-400 mb-4">Kiểm tra token, nhận phản hồi AI và xuất thẻ của bạn.</p>
                </div>

                <div className="bg-slate-900/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-lg text-slate-200 mb-3">Số lượng token ước tính</h4>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <dt className="text-slate-400">Mô tả:</dt>
                        <dd className="text-right font-mono text-amber-400">{tokenCounts.description}</dd>
                        
                        <dt className="text-slate-400">Tính cách:</dt>
                        <dd className="text-right font-mono text-amber-400">{tokenCounts.personality}</dd>

                        <dt className="text-slate-400">Lời chào đầu tiên:</dt>
                        <dd className="text-right font-mono text-amber-400">{tokenCounts.first_mes}</dd>

                        <dt className="text-slate-400">Ví dụ hội thoại:</dt>
                        <dd className="text-right font-mono text-amber-400">{tokenCounts.mes_example}</dd>

                        <div className="border-t border-slate-700 col-span-2 my-1"></div>
                        
                        <dt className="text-slate-300 font-bold">Tổng token cốt lõi:</dt>
                        <dd className="text-right font-mono text-amber-300 font-bold">{tokenCounts.total}</dd>
                    </dl>
                </div>
                
                {/* Architect Button */}
                <div>
                    <button
                        onClick={onOpenArchitect}
                        className="w-full mb-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 group border border-white/10"
                    >
                        <span className="text-xl">✨</span>
                        <span>Mở AI Studio Architect</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </button>
                </div>

                <div>
                     <h4 className="font-semibold text-lg text-slate-200 mb-3">Cải tiến bằng AI</h4>
                     <div className="grid grid-cols-2 gap-2">
                         {(['description', 'personality', 'first_mes', 'mes_example'] as EnhancementField[]).map((field) => (
                             <button 
                                key={field}
                                onClick={() => handleEnhance(field)}
                                disabled={isEnhancing !== null || isAnalyzing}
                                className="text-sm w-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center capitalize border border-slate-600"
                             >
                                {isEnhancing === field ? <Loader message='' /> : `Cải thiện ${enhancementFieldLabels[field]}`}
                             </button>
                         ))}
                     </div>
                </div>

                <div>
                    <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || isEnhancing !== null}
                        className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                    >
                        {isAnalyzing ? <Loader message="Gemini đang xử lý..." /> : 'Phân tích với Gemini'}
                    </button>
                </div>
                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-lg text-sm">{error}</p>}
                {analysisResult && (
                    <div className="bg-slate-900/50 p-4 rounded-lg prose prose-invert prose-sm max-w-none text-slate-300 whitespace-pre-wrap font-sans">
                       {analysisResult}
                    </div>
                )}
            </div>

            <div className="flex-shrink-0 space-y-4 pt-6 border-t border-slate-700">
                <h3 className="text-xl font-bold text-sky-400">Xuất Thẻ</h3>
                <div className="flex items-center gap-4">
                    <div className="w-24 h-24 bg-slate-900 rounded-lg flex-shrink-0 overflow-hidden">
                       {avatarUrl ? (
                           <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                       ) : (
                           <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs text-center p-2">Chưa có avatar</div>
                       )}
                    </div>
                    <div className="flex-grow">
                        <input type="file" accept="image/png,image/jpeg" onChange={handleAvatarUpload} className="sr-only" ref={avatarInputRef} />
                        <button onClick={() => avatarInputRef.current?.click()} className="w-full text-sm bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-3 rounded-lg transition-colors duration-200">
                            Tải lên Avatar mới
                        </button>
                        <p className="text-xs text-slate-500 mt-2">Tải lên tệp .png hoặc .jpeg để dùng làm avatar cho thẻ.</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleExportClick('json')} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                        Xuất ra JSON
                    </button>
                    <button onClick={() => handleExportClick('png')} disabled={!avatarFile || isExporting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                        {isExporting ? <Loader message="" /> : 'Xuất ra PNG'}
                    </button>
                </div>
            </div>

            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onConfirm={performExport}
                initialFileName={fileName || card.name || 'character'}
                title={exportType === 'json' ? 'Xuất thẻ JSON' : 'Xuất thẻ PNG'}
                fileExtension={exportType === 'json' ? '.json' : '.png'}
            />
        </div>
    );
};

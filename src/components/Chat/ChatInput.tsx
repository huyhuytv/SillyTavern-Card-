
import React, { useState, FormEvent, KeyboardEvent, useEffect } from 'react';
import type { QuickReply, ScriptButton } from '../../types';
import { Loader } from '../Loader';
import { truncateText } from '../../utils';

interface ChatInputProps {
    onSend: (text: string) => void;
    isLoading: boolean;
    isImmersive: boolean;
    quickReplies: QuickReply[];
    onQuickReplyClick: (reply: QuickReply) => void;
    // New Props
    scriptButtons?: ScriptButton[];
    onScriptButtonClick?: (btn: ScriptButton) => void;
    
    authorNote?: string;
    onUpdateAuthorNote: (note: string) => void;
    isSummarizing: boolean;
    isInputLocked?: boolean; 
    children?: React.ReactNode; 
}

export const ChatInput: React.FC<ChatInputProps> = ({
    onSend,
    isLoading,
    isImmersive,
    quickReplies,
    onQuickReplyClick,
    scriptButtons = [],
    onScriptButtonClick,
    authorNote,
    onUpdateAuthorNote,
    isSummarizing,
    isInputLocked = false,
    children
}) => {
    const [userInput, setUserInput] = useState('');

    // Listen for input updates from interactive cards (e.g. Landlord Sim buttons)
    useEffect(() => {
        const handleSetInput = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail) {
                setUserInput(String(customEvent.detail));
            }
        };
        window.addEventListener('sillytavern:set-input', handleSetInput);
        return () => window.removeEventListener('sillytavern:set-input', handleSetInput);
    }, []);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading || isInputLocked) return;
        onSend(userInput);
        setUserInput('');
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        // Optional: You can add Shift+Enter logic here if using a textarea later
    };

    const inputAreaClasses = isImmersive
        ? "relative z-10 bg-slate-900/60 backdrop-blur-md border-t border-white/10 w-full"
        : "border-t border-slate-700 relative z-10 bg-slate-800/80 backdrop-blur-md";

    const inputFormClasses = isImmersive
         ? "p-4 md:p-6 w-full max-w-5xl mx-auto"
         : "p-4 md:p-6";

    return (
        <div className={inputAreaClasses}>
            {/* SCRIPT BUTTONS BAR (NEW) */}
            {!isInputLocked && scriptButtons.length > 0 && onScriptButtonClick && (
                <div className="px-4 pt-2 pb-1 flex flex-wrap gap-2 justify-center md:justify-start animate-fade-in-up border-b border-white/5">
                     {scriptButtons.map((btn) => (
                        <button
                            key={btn.id}
                            onClick={() => onScriptButtonClick(btn)}
                            className="px-3 py-1.5 text-xs font-bold rounded bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all transform active:scale-95 border border-indigo-400/30 flex items-center gap-1"
                        >
                            <span className="text-indigo-200">⚡</span> {btn.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Quick Replies */}
            {!isInputLocked && quickReplies.length > 0 && (
                <div className="px-4 pt-2 flex flex-wrap gap-2 justify-end animate-slide-in-right">
                    {quickReplies.map((reply, idx) => (
                        <button
                            key={idx}
                            onClick={() => onQuickReplyClick(reply)}
                            className={`px-3 py-1.5 text-sm rounded-full transition-colors border shadow-sm ${
                                isImmersive 
                                ? 'bg-slate-700/80 border-slate-500 hover:bg-sky-600/90 text-white' 
                                : 'bg-slate-700 hover:bg-sky-600 text-slate-200 hover:text-white border-slate-600'
                            }`}
                        >
                            {reply.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Author Note Display */}
            {authorNote && (
                <div className="px-4 pt-3 text-xs">
                    <div className={`p-2 rounded-md flex justify-between items-center gap-2 ${
                        isImmersive 
                        ? 'bg-slate-800/50 backdrop-blur-md border border-slate-700' 
                        : 'bg-slate-900/70'
                    }`}>
                        <p className="text-slate-400 flex-grow truncate">
                            <span className="font-bold text-sky-400">Ghi chú: </span>
                            <span className="italic">{truncateText(authorNote, 100)}</span>
                        </p>
                        <button 
                            onClick={() => onUpdateAuthorNote('')} 
                            className="text-slate-500 hover:text-white p-1 rounded-full flex-shrink-0" 
                            title="Xóa ghi chú"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            <div className={inputFormClasses}>
                {/* Status Loader */}
                <div className="flex items-center justify-end mb-3 min-h-[20px]">
                    {isSummarizing && <Loader message="Đang tóm tắt..." />}
                </div>

                {/* Input Form */}
                <form onSubmit={handleSubmit} className="flex gap-4">
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={isInputLocked ? "Đang chờ kịch bản..." : (isImmersive ? "Nhập tin nhắn..." : "Nhập tin nhắn... (Sử dụng /help để xem các lệnh)")}
                            className={`w-full rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition disabled:opacity-50 ${
                                isImmersive 
                                ? 'bg-slate-800/70 border-slate-600/50 backdrop-blur-md placeholder-slate-400' 
                                : 'bg-slate-700 border border-slate-600'
                            } ${isInputLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                            disabled={isLoading || isInputLocked}
                            aria-label="Chat input"
                        />
                        {isInputLocked && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                            </div>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading || isInputLocked || !userInput.trim()}
                        className={`text-white font-bold py-2 px-5 rounded-lg transition-colors duration-200 disabled:bg-slate-600 disabled:cursor-not-allowed flex-shrink-0 ${
                            isImmersive 
                            ? 'bg-sky-600/80 hover:bg-sky-600 backdrop-blur-md' 
                            : 'bg-sky-600 hover:bg-sky-700'
                        }`}
                        aria-label="Gửi tin nhắn"
                    >
                        Gửi
                    </button>
                </form>
                
                {/* Footer Content (DebugPanel, etc.) */}
                {children}
            </div>
        </div>
    );
};

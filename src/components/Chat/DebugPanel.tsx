
import React, { useState, useMemo } from 'react';
import type { SystemLogEntry, ChatTurnLog, PromptSection } from '../../types';

interface DebugPanelProps {
    logs: {
        turns: ChatTurnLog[];
        systemLog: SystemLogEntry[];
        smartScanLog: string[];
        worldInfoLog: string[];
    };
    onClearLogs: () => void;
    onInspectState: () => void;
    onCopyLogs: () => void; // Legacy global copy
    copyStatus: boolean;
    isImmersive: boolean;
    onLorebookCreatorOpen: () => void;
}

const CopyButton: React.FC<{ textToCopy: string, label?: string }> = ({ textToCopy, label = 'Sao chép' }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <button 
            onClick={handleCopy}
            className="text-[10px] text-slate-400 hover:text-sky-400 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors border border-slate-700 flex-shrink-0 focus:ring-1 focus:ring-sky-500 focus:outline-none"
        >
            {copied ? 'Đã chép!' : label}
        </button>
    );
};

const PromptBlock: React.FC<{ section: PromptSection }> = ({ section }) => {
    // Use subSections if available (for World Info explotion), otherwise default logic
    const hasSubSections = section.subSections && section.subSections.length > 0;
    
    const lines = useMemo(() => section.content.split('\n'), [section.content]);

    // Logic tự động phát hiện chế độ hiển thị dựa trên tên tiêu đề (cho các mục không có subSections)
    const isListMode = useMemo(() => {
        const keywords = ['World Info', 'Lore', 'Book', 'Replacement', 'Stop Strings', 'Author Note'];
        return keywords.some(k => section.name.toLowerCase().includes(k.toLowerCase()));
    }, [section.name]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = target.nextElementSibling as HTMLElement;
            if (next && next.tabIndex >= 0) next.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = target.previousElementSibling as HTMLElement;
            if (prev && prev.tabIndex >= 0) prev.focus();
        }
    };

    return (
        <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden mb-2 shadow-sm">
            <div className="bg-slate-800/50 px-3 py-2 flex justify-between items-center border-b border-slate-700/50 sticky top-0 z-10 backdrop-blur-sm">
                <div className="flex items-center gap-2 overflow-hidden">
                    <h4 className="text-xs font-bold text-violet-300 truncate" title={section.name}>
                        {section.name} 
                        {hasSubSections && <span className="ml-2 text-[9px] text-emerald-400 font-normal border border-emerald-800 px-1 rounded bg-emerald-900/30">Expanded View</span>}
                        {!hasSubSections && isListMode && <span className="ml-2 text-[9px] text-slate-500 font-normal border border-slate-700 px-1 rounded bg-slate-900">List Mode</span>}
                    </h4>
                </div>
            </div>
            
            <div className="p-2 flex flex-col gap-1 bg-slate-900/30 max-h-[400px] overflow-y-auto custom-scrollbar group">
                
                {hasSubSections ? (
                    // --- CHẾ ĐỘ DANH SÁCH MỞ RỘNG (SubSections - World Info) ---
                    section.subSections!.map((sub, idx) => (
                        <div 
                            key={idx}
                            tabIndex={0}
                            onKeyDown={handleKeyDown}
                            className="bg-slate-900/80 border border-slate-700/50 hover:border-violet-500/30 focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 focus:bg-slate-800 focus:outline-none rounded px-2 py-2 text-[10px] font-mono text-slate-300 break-words whitespace-pre-wrap transition-colors cursor-text mb-1"
                        >
                            {/* Optional: Add a small index marker */}
                            <span className="text-slate-600 select-none mr-2">#{idx + 1}</span>
                            {sub}
                        </div>
                    ))
                ) : isListMode ? (
                    // --- CHẾ ĐỘ DANH SÁCH DÒNG (List Mode - Legacy) ---
                    lines.map((line, idx) => {
                        if (!line.trim()) return null;
                        return (
                            <div 
                                key={idx} 
                                tabIndex={0}
                                onKeyDown={handleKeyDown}
                                className="bg-slate-950/80 border border-slate-800 hover:border-violet-500/30 focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 focus:bg-slate-800 focus:outline-none rounded px-2 py-1.5 text-[10px] font-mono text-slate-300 break-words whitespace-pre-wrap transition-colors cursor-text"
                            >
                                {line}
                            </div>
                        );
                    })
                ) : (
                    // --- CHẾ ĐỘ VĂN BẢN (Text Mode) ---
                    <div 
                        tabIndex={0}
                        className="bg-slate-950/80 border border-slate-800 focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/30 focus:outline-none rounded px-2 py-2 text-[10px] font-mono text-slate-300 break-words whitespace-pre-wrap transition-colors"
                    >
                        {section.content || <span className="text-slate-600 italic">(Nội dung trống)</span>}
                    </div>
                )}

                {isListMode && !hasSubSections && lines.every(l => !l.trim()) && (
                    <p className="text-[10px] text-slate-600 italic px-2 py-1 text-center">(Nội dung trống)</p>
                )}
            </div>
        </div>
    );
};

// --- 1. Console View (Bảng điều khiển Hệ thống) ---
const ConsoleView: React.FC<{ logs: SystemLogEntry[], onInspectState: () => void, onClearLogs: () => void }> = ({ logs, onInspectState, onClearLogs }) => {
    const [logFilter, setLogFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const LOG_FILTERS = [
        { id: 'all', label: 'Tất cả' },
        { id: 'errors', label: 'Lỗi' },
        { id: 'warn', label: 'Cảnh báo' },
        { id: 'console', label: 'Browser Console' }, // New
        { id: 'network', label: 'Mạng' }, // New
        { id: 'iframe', label: 'Iframe' },
        { id: 'regex', label: 'Regex' },
        { id: 'variable', label: 'Biến số' },
        { id: 'state', label: 'Trạng thái' },
    ];

    const getLogLevelClass = (log: SystemLogEntry) => {
        const { level, source } = log;
        
        if (source === 'console' && level === 'error') return 'text-orange-400 bg-orange-900/10 border-orange-900/30';
        if (source === 'network') return 'text-pink-400 bg-pink-900/10 border-pink-900/30';

        switch (level) {
            case 'error': case 'script-error': case 'api-error': return 'text-red-400 bg-red-900/10 border-red-900/30';
            case 'warn': return 'text-amber-400 bg-amber-900/10 border-amber-900/30';
            case 'script-success': return 'text-green-400';
            case 'interaction': return 'text-sky-400';
            case 'api': return 'text-violet-400';
            case 'state': return 'text-teal-400';
            case 'log': default: return 'text-slate-300';
        }
    };

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
    };

    const filteredSystemLogs = useMemo(() => {
        let results = logs;
        if (logFilter === 'errors') results = results.filter(l => l.level.includes('error'));
        else if (logFilter === 'warn') results = results.filter(l => l.level === 'warn');
        else if (logFilter === 'iframe') results = results.filter(l => l.source === 'iframe');
        else if (logFilter === 'regex') results = results.filter(l => l.source === 'regex');
        else if (logFilter === 'variable') results = results.filter(l => l.source === 'variable');
        else if (logFilter === 'state') results = results.filter(l => l.level === 'state');
        else if (logFilter === 'console') results = results.filter(l => l.source === 'console'); // New
        else if (logFilter === 'network') results = results.filter(l => l.source === 'network'); // New
        
        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            results = results.filter(l => l.message.toLowerCase().includes(lowerTerm));
        }
        return results;
    }, [logs, logFilter, searchTerm]);

    const handleCopyFiltered = () => {
        const text = filteredSystemLogs.map(l => `[${formatTimestamp(l.timestamp)}] [${l.source.toUpperCase()}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="space-y-4 text-xs">
             <div className="flex flex-col gap-2">
                <div className="flex gap-1 flex-wrap">
                    {LOG_FILTERS.map(f => (
                        <button key={f.id} onClick={() => setLogFilter(f.id)} className={`px-2 py-0.5 text-[9px] uppercase font-bold rounded ${logFilter === f.id ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>{f.label}</button>
                    ))}
                </div>
                <div className="flex items-center justify-between gap-2 bg-slate-800/30 p-2 rounded-lg border border-slate-700/50">
                    <input type="text" placeholder="Tìm kiếm log..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[10px] flex-grow min-w-[100px]" />
                    <div className="flex items-center gap-1">
                        <button onClick={onInspectState} className="px-2 py-1 bg-teal-600/20 text-teal-400 border border-teal-600/30 rounded hover:bg-teal-600/40" title="Kiểm tra trạng thái biến">🔍 State</button>
                        <button onClick={handleCopyFiltered} className="px-2 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 border border-slate-600" title="Sao chép log đang hiển thị">📋 Copy</button>
                        <button onClick={onClearLogs} className="px-2 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded hover:bg-red-600/40" title="Xóa toàn bộ log">🗑️ Clear</button>
                    </div>
                </div>
            </div>
            <div className="bg-slate-900/30 rounded-md font-mono text-[10px] border border-slate-700 max-h-[300px] overflow-y-auto custom-scrollbar">
                {filteredSystemLogs.length === 0 ? (
                    <div className="p-4 text-center text-slate-600 italic">Không có log hệ thống nào khớp với bộ lọc.</div>
                ) : (
                    filteredSystemLogs.map((log, idx) => (
                        <div key={idx} className={`p-1.5 border-b border-slate-800/50 flex gap-2 ${getLogLevelClass(log)}`}>
                            <span className="opacity-50 flex-shrink-0">{formatTimestamp(log.timestamp)}</span>
                            <span className="font-bold uppercase opacity-70 w-14 flex-shrink-0 truncate text-center border border-white/10 rounded bg-black/20 text-[9px] px-1">
                                {log.source}
                            </span>
                            <span className="break-words flex-grow">{log.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// --- 2. AI Lorebook Creator (Khu vực tạo) ---
const AiCreatorView: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
    return (
        <div className="p-2">
            <button onClick={onOpen} className="w-full text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg border border-indigo-400/30 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
                <span className="text-lg" aria-hidden="true">✨</span>
                <span>Tạo Mục Sổ tay Mới với AI</span>
            </button>
            <p className="text-[10px] text-slate-500 text-center mt-2">Sử dụng ngữ cảnh hội thoại hiện tại để tạo nội dung World Info tự động.</p>
        </div>
    );
}

// --- 3. World Info Logs ---
const WorldInfoLogView: React.FC<{ logs: string[] }> = ({ logs }) => {
    return (
        <div className="space-y-2">
            {logs.length === 0 ? (
                <div className="p-4 text-center text-slate-600 italic text-xs bg-slate-900/30 rounded-lg border border-slate-800">Chưa có mục World Info nào được kích hoạt.</div>
            ) : (
                logs.map((log, idx) => (
                    <div key={idx} className="bg-slate-900/30 border border-slate-700/50 rounded-lg p-3">
                        <div className="flex justify-end mb-1">
                            <CopyButton textToCopy={log} label="Copy" />
                        </div>
                        <pre className="text-[10px] text-emerald-300 font-mono whitespace-pre-wrap break-words">{log}</pre>
                    </div>
                ))
            )}
        </div>
    );
}

// --- 4. Smart Scan Logs (UPDATED) ---
const SmartScanLogView: React.FC<{ logs: string[] }> = ({ logs }) => {
    return (
        <div className="space-y-4">
            {logs.length === 0 ? (
                <div className="p-4 text-center text-slate-600 italic text-xs bg-slate-900/30 rounded-lg border border-slate-800">Chưa có dữ liệu Smart Scan.</div>
            ) : (
                logs.map((logString, idx) => {
                    let parsedLog = { latency: 0, fullPrompt: '', rawResponse: '' };
                    try {
                        parsedLog = JSON.parse(logString);
                    } catch (e) {
                        // Fallback for legacy logs or parse error
                        parsedLog.fullPrompt = logString;
                    }

                    return (
                        <div key={idx} className="bg-slate-900/30 border border-fuchsia-500/20 rounded-lg p-3">
                            <div className="flex justify-between items-center mb-2 border-b border-fuchsia-500/20 pb-2">
                                <span className="text-xs font-bold text-fuchsia-400">Scan #{logs.length - idx} <span className="text-slate-500 font-normal">({parsedLog.latency}ms)</span></span>
                            </div>
                            
                            <details className="mb-2 group">
                                <summary className="cursor-pointer text-[10px] text-slate-400 hover:text-sky-400 font-bold mb-1 flex items-center gap-2">
                                    <span>📤 Lời nhắc Gửi đi (Outgoing Prompt)</span>
                                    <span className="transform group-open:rotate-90 transition-transform text-[8px]" aria-hidden="true">▶</span>
                                </summary>
                                <div className="relative mt-1">
                                    <div className="absolute top-1 right-1 z-10">
                                        <CopyButton textToCopy={parsedLog.fullPrompt} />
                                    </div>
                                    <pre className="text-[9px] text-slate-300 font-mono whitespace-pre-wrap break-words bg-black/20 p-2 rounded border border-slate-700/50 max-h-40 overflow-y-auto custom-scrollbar">
                                        {parsedLog.fullPrompt}
                                    </pre>
                                </div>
                            </details>

                            <div className="relative">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] text-green-400 font-bold">📥 Phản hồi Thô (AI Response)</span>
                                    <CopyButton textToCopy={parsedLog.rawResponse} label="Copy JSON" />
                                </div>
                                <pre className="text-[10px] text-indigo-200 font-mono whitespace-pre-wrap break-words bg-black/20 p-2 rounded border border-indigo-500/20">
                                    {parsedLog.rawResponse}
                                </pre>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

// --- 5. Prompts View ---
const PromptsView: React.FC<{ turns: ChatTurnLog[] }> = ({ turns }) => {
    return (
        <div className="space-y-2">
            {turns.length === 0 ? (
                <div className="p-8 text-center text-slate-600 italic text-xs bg-slate-900/30 rounded-lg border border-slate-800">Chưa có dữ liệu lời nhắc.</div>
            ) : (
                turns.map((turn, index) => (
                    <details key={index} className="group bg-slate-900/30 border border-slate-700/50 rounded-lg">
                        <summary className="px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors select-none list-none flex items-center justify-between rounded-lg outline-none focus:ring-2 focus:ring-sky-500/50">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-violet-400">Lượt #{index + 1}</span>
                                <span className="text-[10px] text-slate-500">{new Date(turn.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 rounded">{turn.prompt.length} mục</span>
                                <span className="transform group-open:rotate-90 transition-transform text-slate-500 text-[10px]" aria-hidden="true">▶</span>
                            </div>
                        </summary>
                        <div className="p-3 space-y-2 border-t border-slate-700/50">
                             <div className="flex justify-end mb-2">
                                 <CopyButton textToCopy={turn.prompt.map(p => p.content).join('\n\n')} label="Sao chép tất cả" />
                             </div>
                            {turn.prompt.length === 0 ? (
                                <p className="text-xs text-slate-600 italic">Không có dữ liệu prompt.</p>
                            ) : (
                                turn.prompt.map((section) => (
                                    <PromptBlock key={section.id} section={section} />
                                ))
                            )}
                        </div>
                    </details>
                ))
            )}
        </div>
    );
}

// --- 6. Responses View ---
const ResponsesView: React.FC<{ turns: ChatTurnLog[] }> = ({ turns }) => {
    return (
        <div className="space-y-2">
            {turns.length === 0 ? (
                <div className="p-8 text-center text-slate-600 italic text-xs bg-slate-900/30 rounded-lg border border-slate-800">Chưa có dữ liệu phản hồi.</div>
            ) : (
                turns.map((turn, index) => (
                    <details key={index} className="group bg-slate-900/30 border border-slate-700/50 rounded-lg">
                        <summary className="px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors select-none list-none flex items-center justify-between rounded-lg outline-none focus:ring-2 focus:ring-sky-500/50">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-emerald-400">Lượt #{index + 1}</span>
                                <span className="text-[10px] text-slate-500">{new Date(turn.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <span className="transform group-open:rotate-90 transition-transform text-slate-500 text-[10px]" aria-hidden="true">▶</span>
                        </summary>
                        <div className="p-3 border-t border-slate-700/50 relative">
                            <div className="absolute top-3 right-3 z-10">
                                <CopyButton textToCopy={turn.response} />
                            </div>
                            <pre className="bg-slate-950 p-3 rounded border border-slate-800 text-[10px] font-mono text-slate-300 whitespace-pre-wrap break-words">
                                {turn.response || '(Chưa có phản hồi)'}
                            </pre>
                        </div>
                    </details>
                ))
            )}
        </div>
    );
}

// --- 7. Summaries View ---
const SummariesView: React.FC<{ turns: ChatTurnLog[] }> = ({ turns }) => {
    const turnsWithSummary = turns.filter(t => t.summary);
    
    return (
        <div className="space-y-2">
            {turnsWithSummary.length === 0 ? (
                <div className="p-8 text-center text-slate-600 italic text-xs bg-slate-900/30 rounded-lg border border-slate-800">Chưa có tóm tắt nào được tạo.</div>
            ) : (
                turnsWithSummary.map((turn, index) => (
                    <details key={index} className="group bg-slate-900/30 border border-slate-700/50 rounded-lg">
                        <summary className="px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors select-none list-none flex items-center justify-between rounded-lg outline-none focus:ring-2 focus:ring-sky-500/50">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-amber-400">Tóm tắt tại Lượt #{turns.indexOf(turn) + 1}</span>
                                <span className="text-[10px] text-slate-500">{new Date(turn.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <span className="transform group-open:rotate-90 transition-transform text-slate-500 text-[10px]" aria-hidden="true">▶</span>
                        </summary>
                        <div className="p-3 border-t border-slate-700/50 relative">
                             <div className="absolute top-3 right-3 z-10">
                                <CopyButton textToCopy={turn.summary || ''} />
                            </div>
                            <div className="bg-amber-900/10 border border-amber-900/30 p-3 rounded">
                                <p className="text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap">{turn.summary}</p>
                            </div>
                        </div>
                    </details>
                ))
            )}
        </div>
    );
}

// --- MAIN COMPONENT ---

export const DebugPanel: React.FC<DebugPanelProps> = ({ logs, onClearLogs, onInspectState, onCopyLogs, copyStatus, isImmersive, onLorebookCreatorOpen }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (isImmersive) return null;

    const errorCount = logs.systemLog.filter(l => l.level.includes('error')).length;

    return (
        <div className="mt-4 border-t border-slate-700/50">
            {/* Header */}
            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 transition-colors text-slate-300 rounded-t-lg group focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500/50"
            >
                <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden="true">🛠️</span>
                    <span className="font-bold text-sm group-hover:text-white transition-colors">Bảng Gỡ Lỗi & Dữ Liệu Hệ Thống</span>
                    {errorCount > 0 && (
                        <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-red-500/30 flex items-center gap-1 animate-pulse">
                            <span aria-hidden="true">●</span> {errorCount} Lỗi
                        </span>
                    )}
                </div>
                <svg className={`w-5 h-5 text-slate-500 transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Body: Linear Layout with 7 Sections */}
            {isExpanded && (
                <div className="bg-slate-900/50 border-x border-b border-slate-800 rounded-b-lg p-2 animate-fade-in-up max-h-[70vh] overflow-y-auto custom-scrollbar">
                    
                    {/* Section 1: Console */}
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2 border-b border-sky-500/20 pb-1 flex items-center gap-2">
                            <span>1. Bảng điều khiển Hệ thống (Console)</span>
                        </h3>
                        <ConsoleView logs={logs.systemLog} onInspectState={onInspectState} onClearLogs={onClearLogs} />
                    </div>

                    {/* Section 2: AI Creator */}
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 border-b border-indigo-500/20 pb-1 flex items-center gap-2">
                            <span>2. Công cụ AI</span>
                        </h3>
                        <AiCreatorView onOpen={onLorebookCreatorOpen} />
                    </div>

                    {/* Section 3: World Info Logs */}
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 border-b border-emerald-500/20 pb-1 flex items-center gap-2">
                            <span>3. Nhật ký Quét World Info</span>
                        </h3>
                        <WorldInfoLogView logs={logs.worldInfoLog} />
                    </div>

                    {/* Section 4: Smart Scan Logs */}
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-fuchsia-400 uppercase tracking-wider mb-2 border-b border-fuchsia-500/20 pb-1 flex items-center gap-2">
                            <span>4. Nhật ký Smart Scan</span>
                        </h3>
                        <SmartScanLogView logs={logs.smartScanLog} />
                    </div>

                    {/* Section 5: Prompts */}
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2 border-b border-violet-500/20 pb-1 flex items-center gap-2">
                            <span>5. Lời nhắc Gửi đi (Prompts)</span>
                        </h3>
                        <PromptsView turns={logs.turns} />
                    </div>

                    {/* Section 6: Responses */}
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2 border-b border-blue-500/20 pb-1 flex items-center gap-2">
                            <span>6. Phản hồi AI (Raw Response)</span>
                        </h3>
                        <ResponsesView turns={logs.turns} />
                    </div>

                    {/* Section 7: Summaries */}
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 border-b border-amber-500/20 pb-1 flex items-center gap-2">
                            <span>7. Tóm tắt (Summaries)</span>
                        </h3>
                        <SummariesView turns={logs.turns} />
                    </div>

                </div>
            )}
        </div>
    );
};

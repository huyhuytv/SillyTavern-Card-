
import React, { useState, useMemo } from 'react';
import type { SystemLogEntry, ChatTurnLog, PromptSection, SummaryQueueItem } from '../../types';
import { CopyButton } from '../ui/CopyButton';

interface SummaryStats {
    messageCount: number;
    summaryCount: number;
    contextDepth: number;
    chunkSize: number;
    queueLength: number;
}

interface DebugPanelProps {
    logs: {
        turns: ChatTurnLog[];
        systemLog: SystemLogEntry[];
        smartScanLog: string[];
        worldInfoLog: string[];
        mythicLog: string[]; // NEW
    };
    onClearLogs: () => void;
    onInspectState: () => void;
    onCopyLogs: () => void; // Legacy global copy
    copyStatus: boolean;
    isImmersive: boolean;
    onLorebookCreatorOpen: () => void;
    // Optional props for summary stats
    summaryStats?: SummaryStats;
    // NEW: Persistent Data Array & Queue
    longTermSummaries?: string[];
    summaryQueue?: SummaryQueueItem[];
    onForceSummarize?: () => void;
    onRegenerateSummary?: (index: number) => Promise<void>; 
    onRetryFailedTask?: () => Promise<void>; 
    onRetryMythic?: () => Promise<void>; // NEW: Manual Mythic Trigger
}

const PromptBlock: React.FC<{ section: PromptSection }> = ({ section }) => {
    // Use subSections if available (for World Info explotion), otherwise default logic
    const hasSubSections = section.subSections && section.subSections.length > 0;
    
    const lines = useMemo(() => section.content.split('\n'), [section.content]);

    // Logic tự động phát hiện chế độ hiển thị dựa trên tên tiêu đề (cho các mục không có subSections)
    const isListMode = useMemo(() => {
        const keywords = ['Replacement', 'Stop Strings'];
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
                        {hasSubSections && <span className="ml-2 text-[9px] text-emerald-400 font-normal border border-emerald-800 px-1 rounded bg-emerald-900/30">Expanded View ({section.subSections?.length})</span>}
                        {!hasSubSections && isListMode && <span className="ml-2 text-[9px] text-slate-500 font-normal border border-slate-700 px-1 rounded bg-slate-900">List Mode</span>}
                    </h4>
                </div>
                <CopyButton textToCopy={section.content} absolute={false} />
            </div>
            
            <div className="p-2 flex flex-col gap-1 bg-slate-900/30 max-h-[400px] overflow-y-auto custom-scrollbar group">
                
                {hasSubSections ? (
                    // --- CHẾ ĐỘ DANH SÁCH MỞ RỘNG (SubSections - Dành cho Lorebook) ---
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
                    // --- CHẾ ĐỘ VĂN BẢN (Text Mode - Mặc định cho Schema, Data, Chat) ---
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
                            <CopyButton textToCopy={log} label="Copy" absolute={false} />
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
                                        <CopyButton textToCopy={parsedLog.fullPrompt} absolute={false} />
                                    </div>
                                    <pre className="text-[9px] text-slate-300 font-mono whitespace-pre-wrap break-words bg-black/20 p-2 rounded border border-slate-700/50 max-h-40 overflow-y-auto custom-scrollbar">
                                        {parsedLog.fullPrompt}
                                    </pre>
                                </div>
                            </details>

                            <div className="relative">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] text-green-400 font-bold">📥 Phản hồi Thô (AI Response)</span>
                                    <CopyButton textToCopy={parsedLog.rawResponse} label="Copy JSON" absolute={false} />
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

// --- 8. Mythic Engine Logs (UPDATED with STRUCTURED PARSER) ---

// Helper Parser
const parseMythicPrompt = (fullText: string): PromptSection[] => {
    const sections: PromptSection[] = [];
    
    // 1. System Instructions (Start to Schema)
    const schemaStart = fullText.indexOf('<Cấu trúc bảng & Luật lệ>');
    if (schemaStart === -1) {
        // Fallback: No structure found, return whole text as one section
        return [{ id: 'mythic_raw', name: 'Raw Prompt (Unstructured)', content: fullText, role: 'system' }];
    }

    const systemContent = fullText.substring(0, schemaStart).trim();
    if (systemContent) {
        sections.push({ id: 'mythic_system', name: '🎛️ System Instructions (Chỉ dẫn)', content: systemContent, role: 'system' });
    }

    // 2. Schema
    const schemaMatch = fullText.match(/<Cấu trúc bảng & Luật lệ>([\s\S]*?)<\/Cấu trúc bảng & Luật lệ>/);
    if (schemaMatch) {
        sections.push({ id: 'mythic_schema', name: '📐 Schema & Rules (Cấu trúc bảng)', content: schemaMatch[1].trim(), role: 'system' });
    }

    // 3. Lorebook (with Splitting for detailed view)
    const loreMatch = fullText.match(/<Dữ liệu tham khảo \(Lorebook\)>([\s\S]*?)<\/Dữ liệu tham khảo \(Lorebook\)>/);
    if (loreMatch) {
        const rawLore = loreMatch[1].trim();
        // Split by "### [Lore:" to create sub-sections as requested
        const entries = rawLore.split('### [Lore:').filter(Boolean).map(e => '### [Lore:' + e);
        
        sections.push({ 
            id: 'mythic_lore', 
            name: '📚 Lorebook Reference (Dữ liệu tham khảo)', 
            content: rawLore, 
            role: 'system',
            subSections: entries.length > 0 ? entries : undefined
        });
    }

    // 4. Current Data (Consolidated Block)
    const dataMatch = fullText.match(/<Dữ liệu bảng hiện tại>([\s\S]*?)<\/Dữ liệu bảng hiện tại>/);
    if (dataMatch) {
        sections.push({ id: 'mythic_data', name: '💾 Current Database (Dữ liệu hiện tại)', content: dataMatch[1].trim(), role: 'system' });
    }

    // 5. Chat History (Consolidated Block)
    const chatMatch = fullText.match(/<Dữ liệu chính văn>([\s\S]*?)<\/Dữ liệu chính văn>/);
    if (chatMatch) {
        sections.push({ id: 'mythic_chat', name: '💬 Chat Context (Chính văn)', content: chatMatch[1].trim(), role: 'system' });
    }

    // 6. Global Rules
    const globalMatch = fullText.match(/LUẬT CHUNG:([\s\S]*)$/);
    if (globalMatch) {
        sections.push({ id: 'mythic_global', name: '⚖️ Global Rules (Luật chung)', content: globalMatch[1].trim(), role: 'system' });
    }

    return sections;
};

const MythicLogView: React.FC<{ logs: string[], onRetry?: () => void }> = ({ logs, onRetry }) => {
    return (
        <div className="space-y-4">
            {logs.length === 0 ? (
                <div className="p-4 text-center text-slate-600 italic text-xs bg-slate-900/30 rounded-lg border border-slate-800">Chưa có dữ liệu Mythic Engine.</div>
            ) : (
                logs.map((logString, idx) => {
                    let parsedLog = { latency: 0, fullPrompt: '', rawResponse: '' };
                    try {
                        parsedLog = JSON.parse(logString);
                    } catch (e) {
                        parsedLog.fullPrompt = logString;
                    }

                    // Parse the huge prompt into sections
                    const structuredPrompt = parseMythicPrompt(parsedLog.fullPrompt);
                    const isLatest = idx === 0;

                    return (
                        <div key={idx} className="bg-slate-900/30 border border-rose-500/20 rounded-lg p-3 relative group">
                            <div className="flex justify-between items-center mb-2 border-b border-rose-500/20 pb-2">
                                <span className="text-xs font-bold text-rose-400">Medusa Cycle #{logs.length - idx} <span className="text-slate-500 font-normal">({parsedLog.latency}ms)</span></span>
                                {isLatest && onRetry && (
                                    <button 
                                        onClick={onRetry}
                                        className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
                                        Tạo lại (Re-run)
                                    </button>
                                )}
                            </div>
                            
                            <details className="mb-2 group">
                                <summary className="cursor-pointer text-[10px] text-slate-400 hover:text-sky-400 font-bold mb-1 flex items-center gap-2">
                                    <span>📤 Lời nhắc Gửi đi (Outgoing Prompt)</span>
                                    <span className="transform group-open:rotate-90 transition-transform text-[8px]" aria-hidden="true">▶</span>
                                </summary>
                                <div className="mt-2 space-y-2 pl-2 border-l border-slate-800">
                                    <div className="flex justify-end">
                                        <CopyButton textToCopy={parsedLog.fullPrompt} label="Copy Toàn bộ" absolute={false} />
                                    </div>
                                    {structuredPrompt.map((section) => (
                                        <PromptBlock key={section.id} section={section} />
                                    ))}
                                </div>
                            </details>

                            <div className="relative">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] text-orange-400 font-bold">📥 Phản hồi Thô (AI Response)</span>
                                    <CopyButton textToCopy={parsedLog.rawResponse} label="Copy" absolute={false} />
                                </div>
                                <pre className="text-[10px] text-orange-100 font-mono whitespace-pre-wrap break-words bg-black/20 p-2 rounded border border-rose-500/20 max-h-60 overflow-y-auto custom-scrollbar">
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
                                 <CopyButton textToCopy={turn.prompt.map(p => p.content).join('\n\n')} label="Sao chép tất cả" absolute={false} />
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
                                <CopyButton textToCopy={turn.response} absolute={true} />
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

// --- 7. Summaries View (ENHANCED WITH RETRY) ---
const SummariesView: React.FC<{ 
    turns: ChatTurnLog[], 
    stats?: SummaryStats, 
    onForceSummarize?: () => void,
    longTermSummaries?: string[],
    summaryQueue?: SummaryQueueItem[], // NEW
    onRegenerate?: (index: number) => Promise<void>,
    onRetry?: () => Promise<void> // NEW
}> = ({ turns, stats, onForceSummarize, longTermSummaries = [], summaryQueue = [], onRegenerate, onRetry }) => {
    
    const [regeneratingIndices, setRegeneratingIndices] = useState<Set<number>>(new Set());
    const [isRetrying, setIsRetrying] = useState(false);
    
    const totalMessages = stats?.messageCount || 0; // Đã là "Active Turns" (Số lượt còn lại trong bộ nhớ)
    const summaryCount = stats?.summaryCount || 0;
    const contextDepth = stats?.contextDepth || 20;
    const queueLength = stats?.queueLength || 0;

    // Logic cũ (Bị sai)
    // const processedTurns = summaryCount * chunkSize; 
    // const unsummarizedCount = Math.max(0, totalMessages - processedTurns);

    // Logic mới: totalMessages được lấy từ useChatMemory (đã cắt) nên nó CHÍNH LÀ unsummarizedCount
    const unsummarizedCount = totalMessages;
    
    const progressPercent = Math.min(100, Math.floor((unsummarizedCount / contextDepth) * 100));
    const canForce = unsummarizedCount >= contextDepth;
    const isBusy = queueLength > 0;

    // Check Queue Status for Errors
    const currentTask = summaryQueue.length > 0 ? summaryQueue[0] : null;
    const hasError = currentTask?.status === 'failed';

    const handleRegenerateClick = async (index: number) => {
        if (!onRegenerate || regeneratingIndices.has(index)) return;
        setRegeneratingIndices(prev => new Set(prev).add(index));
        try {
            await onRegenerate(index);
        } catch (e) {
            console.error("Regenerate failed", e);
            alert(`Lỗi khi tạo lại tóm tắt: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setRegeneratingIndices(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }
    };

    const handleRetryClick = async () => {
        if (!onRetry || isRetrying) return;
        setIsRetrying(true);
        try {
            await onRetry();
        } catch (e) {
            console.error("Retry failed", e);
        } finally {
            setIsRetrying(false);
        }
    }

    return (
        <div className="space-y-4">
            {/* STATUS DASHBOARD */}
            {stats && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 mb-4">
                    <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Số lượng Tóm tắt</p>
                            <p className="text-lg font-mono text-sky-400 font-bold">{summaryCount} <span className="text-xs text-slate-500 font-normal">gói</span></p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Lượt Mới (Trong Bộ Nhớ)</p>
                            <p className={`text-lg font-mono font-bold ${canForce ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
                                ~{unsummarizedCount} <span className="text-xs text-slate-500 font-normal">/ {contextDepth} lượt</span>
                            </p>
                        </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-900 rounded-full h-2 mb-3 overflow-hidden border border-slate-700/50">
                        <div 
                            className={`h-full transition-all duration-500 ${hasError ? 'bg-red-600' : (canForce ? 'bg-amber-500' : 'bg-sky-600')}`} 
                            style={{ width: `${progressPercent}%` }}
                        ></div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex justify-between items-center gap-2">
                        <div className="text-[10px] text-slate-500 flex-grow">
                            {hasError ? (
                                <span className="text-red-400 font-bold flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    Lỗi tóm tắt!
                                </span>
                            ) : queueLength > 0 ? (
                                `Đang xử lý ${queueLength} tác vụ...`
                            ) : (canForce ? "Hệ thống nên tự động tóm tắt ngay." : "Chưa đủ dữ liệu.")}
                        </div>
                        
                        {/* ERROR & RETRY CONTROL */}
                        {hasError && onRetry && (
                            <button
                                onClick={handleRetryClick}
                                disabled={isRetrying}
                                className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 flex items-center gap-2 animate-bounce"
                            >
                                {isRetrying ? 'Đang thử...' : 'Thử lại (Retry)'}
                            </button>
                        )}

                        {!hasError && onForceSummarize && (
                            <button
                                onClick={onForceSummarize}
                                disabled={!canForce || isBusy}
                                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                                    isBusy 
                                        ? 'bg-slate-700 text-slate-500 cursor-wait'
                                        : canForce 
                                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20' 
                                            : 'bg-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
                                }`}
                            >
                                {isBusy ? 'Đang chạy...' : 'Buộc Tóm Tắt'}
                            </button>
                        )}
                    </div>
                    
                    {/* ERROR DETAILS */}
                    {hasError && currentTask && (
                        <div className="mt-2 bg-red-900/20 border border-red-500/30 p-2 rounded text-[10px] text-red-300 break-words font-mono">
                            <strong>Chi tiết lỗi:</strong> {currentTask.error || "Không xác định"}
                        </div>
                    )}
                </div>
            )}

            {/* Summaries List */}
            {longTermSummaries.length === 0 ? (
                <div className="p-8 text-center text-slate-600 italic text-xs bg-slate-900/30 rounded-lg border border-slate-800">Chưa có tóm tắt nào được tạo (Dữ liệu trống).</div>
            ) : (
                longTermSummaries.map((summaryContent, index) => (
                    <details key={index} className="group bg-slate-900/30 border border-slate-700/50 rounded-lg">
                        <summary className="px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors select-none list-none flex items-center justify-between rounded-lg outline-none focus:ring-2 focus:ring-sky-500/50">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-amber-400">Tóm tắt #{index + 1}</span>
                                <span className="text-[10px] text-slate-500 italic">(Dữ liệu Bền vững)</span>
                            </div>
                            <span className="transform group-open:rotate-90 transition-transform text-slate-500 text-[10px]" aria-hidden="true">▶</span>
                        </summary>
                        <div className="p-3 border-t border-slate-700/50 relative">
                             <div className="absolute top-3 right-3 z-10 flex gap-1">
                                <CopyButton textToCopy={summaryContent || ''} absolute={true} />
                            </div>
                            <div className="bg-amber-900/10 border border-amber-900/30 p-3 rounded mb-2">
                                <p className="text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap">{summaryContent}</p>
                            </div>
                            
                            {onRegenerate && (
                                <div className="flex justify-end pt-2 border-t border-slate-700/30">
                                    <button
                                        onClick={() => handleRegenerateClick(index)}
                                        disabled={regeneratingIndices.has(index)}
                                        className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-sky-700 text-slate-400 hover:text-white transition-colors border border-slate-600 hover:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {regeneratingIndices.has(index) ? 'Đang tạo lại...' : 'Thử lại (Regenerate)'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </details>
                ))
            )}
        </div>
    );
}

// --- MAIN COMPONENT ---

export const DebugPanel: React.FC<DebugPanelProps> = ({ 
    logs, 
    onClearLogs, 
    onInspectState, 
    copyStatus, 
    isImmersive, 
    onLorebookCreatorOpen,
    summaryStats,
    longTermSummaries, // Receive Persistent Data
    summaryQueue, // Receive Queue
    onForceSummarize,
    onRegenerateSummary,
    onRetryFailedTask, // Receive Retry Handler
    onRetryMythic // NEW: Retry Mythic
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (isImmersive) return null;

    const errorCount = logs.systemLog.filter(l => l.level.includes('error')).length;
    // Check if any queue item failed
    const queueError = summaryQueue?.some(i => i.status === 'failed');

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
                    {(errorCount > 0 || queueError) && (
                        <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-bold border border-red-500/30 flex items-center gap-1 animate-pulse">
                            <span aria-hidden="true">●</span> {queueError ? 'Lỗi Tóm Tắt' : `${errorCount} Lỗi`}
                        </span>
                    )}
                </div>
                <svg className={`w-5 h-5 text-slate-500 transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Body: Linear Layout with 8 Sections */}
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
                        <SummariesView 
                            turns={logs.turns} 
                            stats={summaryStats} 
                            longTermSummaries={longTermSummaries} // Pass persistent data
                            summaryQueue={summaryQueue} // Pass Queue
                            onForceSummarize={onForceSummarize}
                            onRegenerate={onRegenerateSummary}
                            onRetry={onRetryFailedTask} // Pass Retry
                        />
                    </div>

                    {/* Section 8: Mythic Engine (NEW) */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between border-b border-rose-500/20 pb-1 mb-2">
                            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                                <span>8. Nhật ký Mythic Engine (RPG)</span>
                            </h3>
                            {/* Standalone Force Run Button */}
                            {onRetryMythic && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRetryMythic(); }}
                                    className="px-2 py-0.5 text-[10px] bg-rose-600 hover:bg-rose-500 text-white rounded shadow-sm border border-rose-400/50 flex items-center gap-1 transition-colors"
                                    title="Buộc chạy lại logic RPG cho lượt hội thoại cuối cùng (ngay cả khi log trống)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                    </svg>
                                    Force Run
                                </button>
                            )}
                        </div>
                        <MythicLogView logs={logs.mythicLog} onRetry={onRetryMythic} />
                    </div>

                </div>
            )}
        </div>
    );
};

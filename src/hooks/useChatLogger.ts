
import { useState, useCallback, useEffect } from 'react';
import type { SystemLogEntry, WorldInfoEntry, PromptSection, ChatTurnLog } from '../types';
import { LOG_EVENT_NAME, LogEventDetail } from '../services/logBridge';

// Increase limit to keep more history for detailed inspection
const MAX_TURN_HISTORY = 5; 
const MAX_SYSTEM_LOG_ENTRIES = 200;

export const useChatLogger = () => {
    // New Structure: Array of Turn Objects
    const [turns, setTurns] = useState<ChatTurnLog[]>([]);
    
    // Legacy/Separate logs (still useful for independent components or simple views)
    const [systemLog, setSystemLog] = useState<SystemLogEntry[]>([]);
    const [worldInfoLog, setWorldInfoLog] = useState<string[]>([]);
    const [smartScanLog, setSmartScanLog] = useState<string[]>([]);

    // Helper to get or create the current turn (index 0)
    const ensureCurrentTurn = (currentTurns: ChatTurnLog[]): ChatTurnLog[] => {
        if (currentTurns.length === 0) {
            return [{ timestamp: Date.now(), prompt: [], response: '', systemLogs: [] }];
        }
        return currentTurns;
    };

    const startTurn = useCallback(() => {
        setTurns(prev => {
            const newTurn: ChatTurnLog = { timestamp: Date.now(), prompt: [], response: '', systemLogs: [] };
            return [newTurn, ...prev].slice(0, MAX_TURN_HISTORY);
        });
    }, []);

    const logPrompt = useCallback((promptData: PromptSection[] | string) => {
        // Normalize to array if string passed (legacy compat)
        const promptSections: PromptSection[] = typeof promptData === 'string' 
            ? [{ id: 'legacy_raw', name: 'Raw Prompt', content: promptData, role: 'system' }] 
            : promptData;

        setTurns(prev => {
            const newTurns = ensureCurrentTurn(prev);
            const currentTurn = { ...newTurns[0], prompt: promptSections };
            return [currentTurn, ...newTurns.slice(1)];
        });
    }, []);

    const logResponse = useCallback((response: string) => {
        setTurns(prev => {
            const newTurns = ensureCurrentTurn(prev);
            const currentTurn = { ...newTurns[0], response };
            return [currentTurn, ...newTurns.slice(1)];
        });
    }, []);

    const logSummary = useCallback((summary: string) => {
        setTurns(prev => {
            const newTurns = ensureCurrentTurn(prev);
            const currentTurn = { ...newTurns[0], summary };
            return [currentTurn, ...newTurns.slice(1)];
        });
    }, []);
    
    const logSystemMessage = useCallback((
        level: SystemLogEntry['level'], 
        source: SystemLogEntry['source'],
        message: string, 
        stack?: string, 
        payload?: string
    ) => {
        const newEntry: SystemLogEntry = { 
            level, 
            source,
            message, 
            stack, 
            payload, 
            timestamp: Date.now() 
        };
        
        // 1. Update Global System Log (Console)
        setSystemLog(prev => [newEntry, ...prev].slice(0, MAX_SYSTEM_LOG_ENTRIES));

        // 2. Update Current Turn Log
        setTurns(prev => {
            const newTurns = ensureCurrentTurn(prev);
            const currentTurn = { 
                ...newTurns[0], 
                systemLogs: [newEntry, ...newTurns[0].systemLogs] 
            };
            return [currentTurn, ...newTurns.slice(1)];
        });
    }, []);

    // Listen for Global Events (Bridge)
    useEffect(() => {
        const handleGlobalLog = (e: Event) => {
            const customEvent = e as CustomEvent<LogEventDetail>;
            const { level, source, message, stack, payload } = customEvent.detail;
            
            // Convert payload to string if necessary for consistency, or keep as object if SystemLogEntry supports it
            // Assuming payload is stored as string in SystemLogEntry based on types.ts, let's stringify if object
            let payloadStr = payload;
            if (typeof payload === 'object' && payload !== null) {
                try {
                    payloadStr = JSON.stringify(payload, null, 2);
                } catch {
                    payloadStr = String(payload);
                }
            }

            logSystemMessage(level, source, message, stack, payloadStr);
        };

        window.addEventListener(LOG_EVENT_NAME, handleGlobalLog);
        return () => {
            window.removeEventListener(LOG_EVENT_NAME, handleGlobalLog);
        };
    }, [logSystemMessage]);

    const logDiagnostic = useCallback((logText: string, source: 'regex' | 'variable' = 'regex') => {
        if (!logText) return;
        const lines = logText.split('\n');
        const now = Date.now();
        const entries: SystemLogEntry[] = [];

        lines.forEach((line, index) => {
            const cleanLine = line.trim();
            if (!cleanLine) return;
            let level: SystemLogEntry['level'] = 'log';
            if (cleanLine.includes('[ERR]') || cleanLine.includes('[LỖI]') || cleanLine.includes('Error')) level = 'error';
            else if (cleanLine.includes('[WARN]') || cleanLine.includes('Cảnh báo')) level = 'warn';
            else if (cleanLine.includes('[OK]') || cleanLine.includes('-> [OK]')) level = 'script-success';
            else if (cleanLine.includes('[START]') || cleanLine.includes('[END]')) level = 'state';
            else if (cleanLine.includes('Kết quả mới:')) level = 'interaction';

            entries.push({ level, source, message: cleanLine, timestamp: now + index });
        });

        setSystemLog(prev => [...entries.reverse(), ...prev].slice(0, MAX_SYSTEM_LOG_ENTRIES));
        setTurns(prev => {
            const newTurns = ensureCurrentTurn(prev);
            const currentTurn = { 
                ...newTurns[0], 
                systemLogs: [...entries.reverse(), ...newTurns[0].systemLogs] 
            };
            return [currentTurn, ...newTurns.slice(1)];
        });
    }, []);
    
    const logWorldInfo = useCallback((entries: WorldInfoEntry[]) => {
        if (entries.length === 0) {
            setWorldInfoLog(prev => ["Không có mục World Info nào được kích hoạt.", ...prev].slice(0, 10));
            return;
        }
        const formattedLog = entries.map((e, index) => 
            `${index + 1}. [${e.comment || 'Không tên'}] (UID: ${e.uid})\n   Keys: ${e.keys.join(', ')}\n   Order: ${e.insertion_order || 0}`
        ).join('\n\n');
        setWorldInfoLog(prev => [formattedLog, ...prev].slice(0, 10));
    }, []);

    // Updated to handle full prompt and raw response
    const logSmartScan = useCallback((fullPrompt: string, rawResponse: string, latency: number) => {
        const logEntry = JSON.stringify({
            latency,
            fullPrompt,
            rawResponse
        });
        setSmartScanLog(prev => [logEntry, ...prev].slice(0, 10));
    }, []);
    
    const clearLogs = useCallback(() => {
        setTurns([]);
        setSystemLog([]);
        setWorldInfoLog([]);
        setSmartScanLog([]);
    }, []);
    
    const clearSystemLogs = useCallback(() => {
        setSystemLog([]);
    }, []);

    return {
        logs: { turns, systemLog, worldInfoLog, smartScanLog }, // Expose turns
        startTurn,
        logPrompt,
        logResponse,
        logSummary,
        logDiagnostic,
        logWorldInfo,
        logSmartScan,
        logSystemMessage,
        clearLogs,
        clearSystemLogs,
    };
};

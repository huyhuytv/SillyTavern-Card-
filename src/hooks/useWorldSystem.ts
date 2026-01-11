
import { useCallback, useState } from 'react';
import type { CharacterCard, WorldInfoEntry, WorldInfoRuntimeStats, SillyTavernPreset } from '../types';
import { performWorldInfoScan, prepareLorebookForAI } from '../services/worldInfoScanner';
import { processVariableUpdates } from '../services/variableEngine';
import { processWithRegex } from '../services/regexService';
import { scanWorldInfoWithAI } from '../services/geminiService';

export interface WorldSystemResult {
    // Updated to be async to support AI calls
    scanInput: (
        text: string, // Kept for legacy/keyword compatibility (combined)
        worldInfoState: Record<string, boolean>,
        worldInfoRuntime: Record<string, WorldInfoRuntimeStats>,
        worldInfoPinned: Record<string, boolean>,
        preset?: SillyTavernPreset, 
        historyForScan?: string[],
        latestInput?: string, // NEW: Specific latest input for AI mode
        variables?: Record<string, any>, // NEW: Pass current variables
        dynamicEntries?: WorldInfoEntry[] // NEW: Pass generated entries from RPG
    ) => Promise<{
        activeEntries: WorldInfoEntry[];
        updatedRuntimeState: Record<string, WorldInfoRuntimeStats>;
        smartScanLog?: { fullPrompt: string, rawResponse: string, latency: number }; 
    }>;
    processOutput: (
        rawContent: string,
        currentVariables: Record<string, any>
    ) => {
        updatedVariables: Record<string, any>;
        displayContent: string;
        interactiveHtml: string | null;
        diagnosticLog: string;
        variableLog: string;
        originalRawContent: string;
    };
    isScanning: boolean;
}

export const useWorldSystem = (card: CharacterCard | null): WorldSystemResult => {
    const [isScanning, setIsScanning] = useState(false);

    const scanInput = useCallback(async (
        textToScan: string,
        worldInfoState: Record<string, boolean>,
        worldInfoRuntime: Record<string, WorldInfoRuntimeStats>,
        worldInfoPinned: Record<string, boolean>,
        preset?: SillyTavernPreset,
        historyForScan: string[] = [],
        latestInput: string = '',
        variables: Record<string, any> = {},
        dynamicEntries: WorldInfoEntry[] = []
    ) => {
        // MERGE LOGIC: Combine static entries from card with dynamic entries from RPG
        const staticEntries = card?.char_book?.entries || [];
        const allEntries = [...staticEntries, ...dynamicEntries];
        
        let aiActiveUids: string[] = [];
        let smartScanLogData;

        // Determine Mode
        const mode = preset?.smart_scan_mode || (preset?.smart_scan_enabled ? 'hybrid' : 'keyword');
        const isAiEnabled = mode === 'hybrid' || mode === 'ai_only';

        // --- SMART SCAN LOGIC (AI PART) ---
        if (isAiEnabled) {
            setIsScanning(true);
            const startTime = Date.now();
            
            // REMOVED TRY-CATCH HERE TO LET ERRORS BUBBLE UP TO UI
            // The caller (useChatFlow) will handle the error with the Retry/Ignore modal.
            
            // 1. Prepare Context (History)
            const depth = preset?.smart_scan_depth || 3;
            const chatContext = historyForScan.slice(-depth).join('\n');
            
            // 2. Prepare State String
            let stateString = "";
            if (variables && Object.keys(variables).length > 0) {
                stateString = Object.entries(variables)
                    .map(([k, v]) => {
                        if (Array.isArray(v) && v.length > 1 && typeof v[1] === 'string') {
                            return `- ${k}: ${v[0]} (${v[1]})`; 
                        }
                        return `- ${k}: ${JSON.stringify(v)}`;
                    })
                    .join('\n');
            }

            // 3. Prepare Lorebook Payload
            const { contextString, candidateString } = prepareLorebookForAI(allEntries);

            // Only scan if there are candidates
            if (candidateString) {
                try {
                    // 4. Call API
                    const { selectedIds, outgoingPrompt, rawResponse } = await scanWorldInfoWithAI(
                        chatContext, 
                        contextString,
                        candidateString,
                        latestInput || textToScan, 
                        stateString,
                        preset?.smart_scan_model || 'gemini-2.5-flash',
                        preset?.smart_scan_system_prompt 
                    );
                    
                    // 5. Apply "Token Budget"
                    const maxEntries = preset?.smart_scan_max_entries || 5;
                    aiActiveUids = selectedIds.slice(0, maxEntries);
                    
                    const endTime = Date.now();
                    smartScanLogData = {
                        fullPrompt: outgoingPrompt,
                        rawResponse: rawResponse,
                        latency: endTime - startTime
                    };
                } catch (error) {
                    setIsScanning(false);
                    // Re-throw to trigger the modal in parent
                    throw error;
                }
            }
            setIsScanning(false);
        }

        // --- HYBRID / KEYWORD SCANNING ---
        const result = performWorldInfoScan(
            textToScan, 
            allEntries, 
            worldInfoState, 
            worldInfoRuntime, 
            worldInfoPinned,
            aiActiveUids,
            mode === 'ai_only' // Bypass keyword check?
        );

        return { ...result, smartScanLog: smartScanLogData };
    }, [card]);

    const processOutput = useCallback((
        rawContent: string,
        currentVariables: Record<string, any>
    ) => {
        // 1. Variable Engine
        const { updatedVariables, cleanedText, variableLog } = processVariableUpdates(rawContent, currentVariables);

        // 2. Regex / Script Engine
        const scripts = card?.extensions?.regex_scripts || [];
        const { displayContent, interactiveHtml, diagnosticLog } = processWithRegex(cleanedText, scripts, [2]);

        return {
            updatedVariables,
            displayContent,
            interactiveHtml,
            diagnosticLog,
            variableLog,
            originalRawContent: rawContent
        };
    }, [card]);

    return {
        scanInput,
        processOutput,
        isScanning
    };
};

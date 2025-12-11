
import { useState, useCallback, useRef } from 'react';
import type { ChatMessage } from '../types';
import { summarizeHistory } from '../services/geminiService';

// Default values if not configured
const DEFAULT_CONTEXT_DEPTH = 20; 
const DEFAULT_CHUNK_SIZE = 10;

/**
 * Custom hook for managing the long-term memory of the chat through summarization.
 */
export const useChatMemory = (cardName: string) => {
    const [longTermSummaries, setLongTermSummaries] = useState<string[]>([]);
    const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
    
    // Ref to track if we've handled the initial history backlog
    const hasCheckedBacklogRef = useRef(false);

    /**
     * Checks if the chat history has reached the trigger threshold and, if so,
     * triggers the summarization process for the OLDEST chunk of messages within the window.
     * 
     * Logic: Sliding Window (Rolling Buffer)
     * - Trigger: Unsummarized messages >= contextDepth
     * - Action: Summarize the first 'chunkSize' messages of the unsummarized pool.
     * 
     * @param messages The full array of current chat messages.
     * @param onSummaryCreated A callback to log the new summary.
     * @param contextDepth Trigger threshold (e.g., 20).
     * @param summarizationPrompt Custom prompt from settings (optional).
     * @param chunkSize Size of the chunk to summarize (e.g., 10).
     */
    const checkForSummarizationAndStore = useCallback(async (
        messages: ChatMessage[],
        onSummaryCreated: (summary: string) => void,
        contextDepth: number = DEFAULT_CONTEXT_DEPTH,
        summarizationPrompt?: string,
        chunkSize: number = DEFAULT_CHUNK_SIZE
    ): Promise<string[] | undefined> => {
        
        // Ensure valid params
        const safeChunkSize = Math.max(1, chunkSize);
        const safeContextDepth = Math.max(safeChunkSize + 1, contextDepth); // Threshold must be > chunk size ideally

        // Calculate how many messages are already accounted for by summaries
        // Assumption: Each existing summary represents exactly 'chunkSize' messages
        // NOTE: If user changes chunkSize mid-game, this assumption might drift, but it self-corrects 
        // because we only care about the *remaining* messages count for triggering.
        const assumedSummarizedCount = longTermSummaries.length * safeChunkSize;
        const unsummarizedCount = messages.length - assumedSummarizedCount;
        
        // --- SAFETY GUARD: INITIAL BACKLOG CHECK ---
        // When the hook runs for the first time (e.g. reload or changing settings),
        // if we have a huge backlog, just fill it with placeholders to sync the state without expensive API calls.
        if (!hasCheckedBacklogRef.current) {
            hasCheckedBacklogRef.current = true;
            
            if (unsummarizedCount > safeContextDepth) {
                console.log(`[Smart Context] Detected history backlog (${unsummarizedCount} unsummarized msgs). Skipping catch-up summarization.`);
                
                // Calculate how many chunks we need to skip to bring unsummarizedCount down to < safeContextDepth
                const excessMessages = unsummarizedCount - safeContextDepth;
                const chunksToSkip = Math.ceil(excessMessages / safeChunkSize);
                
                if (chunksToSkip > 0) {
                    const placeholders = Array(chunksToSkip).fill(
                        `[Hệ thống: Tóm tắt lịch sử cũ (trước tin nhắn #${assumedSummarizedCount + (chunksToSkip * safeChunkSize)}) đã được bỏ qua để tối ưu hóa.]`
                    );
                    
                    const newSummaries = [...longTermSummaries, ...placeholders];
                    setLongTermSummaries(newSummaries);
                    return newSummaries;
                }
            }
        }
        // -------------------------------------------
        
        // Check Trigger: Do we have enough new messages to summarize a chunk?
        if (unsummarizedCount < safeContextDepth) {
            return; 
        }

        setIsSummarizing(true);
        let newSummaries: string[] | undefined;
        try {
            // Identify the slice to summarize
            // We take the oldest messages from the "Unsummarized" pool.
            // Start index = The count of messages already covered by existing summaries.
            const startIndex = assumedSummarizedCount;
            const endIndex = startIndex + safeChunkSize;
            
            // Safety check: ensure slice is within bounds (though unsummarizedCount check should guarantee this)
            if (endIndex > messages.length) {
                 console.warn("[Smart Context] Slice out of bounds, skipping.");
                 setIsSummarizing(false);
                 return;
            }

            const historySlice = messages.slice(startIndex, endIndex);

            const summary = await summarizeHistory(historySlice, cardName, summarizationPrompt);
            if (summary) {
                newSummaries = [...longTermSummaries, summary];
                setLongTermSummaries(newSummaries);
                onSummaryCreated(summary);
            }
        } catch (err) {
            console.error("Failed to generate and store summary:", err);
            // Don't block chat if summarization fails
        } finally {
            setIsSummarizing(false);
        }
        return newSummaries;
    }, [longTermSummaries, cardName]);
    
    const resetMemory = useCallback(() => {
        setLongTermSummaries([]);
        setIsSummarizing(false);
        hasCheckedBacklogRef.current = false; // Reset backlog check on memory clear
    }, []);

    return {
        longTermSummaries,
        setLongTermSummaries,
        isSummarizing,
        checkForSummarizationAndStore,
        resetMemory,
        defaultPageSize: DEFAULT_CHUNK_SIZE // Exporting logic as 'defaultPageSize' for compatibility, but conceptually it's chunkSize
    };
};

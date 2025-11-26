
import { useState, useCallback } from 'react';
import type { ChatMessage } from '../types';
import { summarizeHistory } from '../services/geminiService';

// Default page size if not configured
const DEFAULT_PAGE_SIZE = 20; 

/**
 * Custom hook for managing the long-term memory of the chat through summarization.
 */
export const useChatMemory = (cardName: string) => {
    const [longTermSummaries, setLongTermSummaries] = useState<string[]>([]);
    const [isSummarizing, setIsSummarizing] = useState<boolean>(false);

    /**
     * Checks if the chat history has reached a page boundary and, if so,
     * triggers the summarization process for the completed page.
     * @param messages The full array of current chat messages.
     * @param onSummaryCreated A callback to log the new summary.
     * @param contextDepth Dynamic depth from settings (optional).
     * @param summarizationPrompt Custom prompt from settings (optional).
     */
    const checkForSummarizationAndStore = useCallback(async (
        messages: ChatMessage[],
        onSummaryCreated: (summary: string) => void,
        contextDepth: number = DEFAULT_PAGE_SIZE,
        summarizationPrompt?: string
    ): Promise<string[] | undefined> => {
        // Determine page size (must be at least 2 to allow for a pair of messages)
        const pageSize = Math.max(2, contextDepth);
        
        const completedPages = Math.floor(messages.length / pageSize);
        
        // Only summarize if we have completed new pages that haven't been summarized yet
        if (completedPages <= longTermSummaries.length) {
            return; 
        }

        setIsSummarizing(true);
        let newSummaries: string[] | undefined;
        try {
            // We summarize the page corresponding to the current index in the summaries array
            const lastCompletedPageIndex = longTermSummaries.length;
            const startIndex = lastCompletedPageIndex * pageSize;
            const endIndex = startIndex + pageSize;
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
    }, []);

    return {
        longTermSummaries,
        setLongTermSummaries,
        isSummarizing,
        checkForSummarizationAndStore,
        resetMemory,
        defaultPageSize: DEFAULT_PAGE_SIZE
    };
};

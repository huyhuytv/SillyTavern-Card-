
import { useCallback, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { summarizeHistory } from '../services/ai/semanticTasks';
import { dispatchSystemLog } from '../services/logBridge';
import { ChatMessage } from '../types';

/**
 * Counts total turns in the chat history. A turn is typically a user-model exchange.
 */
// Fix: Added countTotalTurns helper
export const countTotalTurns = (messages: ChatMessage[]): number => {
    return messages.filter(m => m.role === 'model').length;
};

export const useChatMemory = () => {
    const { messages, longTermSummaries, setSessionData, card, summaryQueue } = useChatStore();
    const [isSummarizing, setIsSummarizing] = useState(false);

    const triggerSummarization = useCallback(async () => {
        if (!card || messages.length < 20) return;

        setIsSummarizing(true);
        dispatchSystemLog('log', 'system', 'Đang thực hiện tóm tắt ngữ cảnh...');

        try {
            const chunk = messages.slice(0, 10);
            const summary = await summarizeHistory(chunk, card.name);
            
            if (summary) {
                const newSummaries = [...longTermSummaries, summary];
                setSessionData({ longTermSummaries: newSummaries });
                dispatchSystemLog('script-success', 'system', 'Tóm tắt thành công.');
            }
        } catch (e) {
            dispatchSystemLog('error', 'system', 'Lỗi tóm tắt dữ liệu.');
        } finally {
            setIsSummarizing(false);
        }
    }, [messages, longTermSummaries, card, setSessionData]);

    // Fix: Added missing methods expected by ChatTester
    return { 
        isSummarizing, 
        triggerSummarization,
        triggerSmartContext: triggerSummarization,
        handleRegenerateSummary: async (index: number) => {
            console.log("Regenerate summary at", index);
        },
        handleRetryFailedTask: async () => {
            console.log("Retry failed summarization task");
        },
        queueLength: summaryQueue?.length || 0,
        summaryQueue: summaryQueue || []
    };
};

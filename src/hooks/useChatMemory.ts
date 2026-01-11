
import { useCallback, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { summarizeHistory } from '../services/ai/semanticTasks';
import { dispatchSystemLog } from '../services/logBridge';
import { ChatMessage } from '../types';

/**
 * Counts total turns in the chat history. A turn is typically a user-model exchange.
 */
export const countTotalTurns = (messages: ChatMessage[]): number => {
    return messages.filter(m => m.role === 'model').length;
};

export const useChatMemory = () => {
    // Lấy thêm preset từ store để đọc cấu hình chunk_size
    const { messages, longTermSummaries, setSessionData, card, summaryQueue, preset } = useChatStore();
    const [isSummarizing, setIsSummarizing] = useState(false);

    const triggerSummarization = useCallback(async () => {
        // Kiểm tra điều kiện tối thiểu để tóm tắt
        // Sử dụng chunk_size từ preset (mặc định 10) để quyết định cắt bao nhiêu tin nhắn
        const chunkSize = preset?.summarization_chunk_size || 10;
        
        // Chỉ tóm tắt nếu số lượng tin nhắn ít nhất gấp đôi chunk size (để còn lại ngữ cảnh sau khi cắt)
        if (!card || messages.length < (chunkSize * 2)) return;

        setIsSummarizing(true);
        dispatchSystemLog('log', 'system', `Đang thực hiện tóm tắt ngữ cảnh (Gói ${chunkSize} lượt)...`);

        try {
            // Cắt đúng số lượng tin nhắn theo cấu hình
            const chunk = messages.slice(0, chunkSize);
            const summary = await summarizeHistory(chunk, card.name);
            
            if (summary) {
                const newSummaries = [...longTermSummaries, summary];
                
                // Cập nhật Store: Thêm tóm tắt mới VÀ cắt bỏ tin nhắn cũ khỏi lịch sử
                // Điều này rất quan trọng để giải phóng bộ nhớ (Context Window)
                const remainingMessages = messages.slice(chunkSize);
                
                setSessionData({ 
                    longTermSummaries: newSummaries,
                    messages: remainingMessages 
                });
                
                dispatchSystemLog('script-success', 'system', 'Tóm tắt thành công & Đã giải phóng bộ nhớ.');
            }
        } catch (e) {
            dispatchSystemLog('error', 'system', `Lỗi tóm tắt dữ liệu: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsSummarizing(false);
        }
    }, [messages, longTermSummaries, card, setSessionData, preset]);

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

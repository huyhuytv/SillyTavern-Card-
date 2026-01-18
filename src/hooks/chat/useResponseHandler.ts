
import { useCallback } from 'react';
import { useChatStore } from '../../store/chatStore';
import { processVariableUpdates } from '../../services/variableEngine';
import { processWithRegex } from '../../services/regexService';
import type { ChatMessage, QuickReply } from '../../types';

// Helper: Trích xuất các lựa chọn từ văn bản thô
// Hỗ trợ cả ngoặc kép thẳng (" ') và ngoặc kép cong (smart quotes “ ”) và ngoặc góc (「 」)
const extractChoices = (text: string): QuickReply[] => {
    const choices: QuickReply[] = [];
    // Regex: Tìm [CHOICE: "Nội dung"] hoặc [CHOICE: “Nội dung”] hoặc [CHOICE: 「Nội dung」]
    // Flags: g (global), i (case-insensitive)
    const regex = /\[CHOICE:\s*(?:["'“「])(.*?)(?:["'”」])\s*\]/gi;
    
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
            const content = match[1].trim();
            if (content) {
                choices.push({
                    label: content,
                    message: content // Khi bấm nút sẽ gửi nội dung này
                });
            }
        }
    }
    return choices;
};

export const useResponseHandler = () => {
    const { setVariables, addMessage, updateMessage, variables, card, setQuickReplies } = useChatStore();

    const processAIResponse = useCallback(async (rawText: string, messageId: string) => {
        // 0. Trích xuất CHOICE (Quick Replies) trước khi làm sạch văn bản
        const extractedChoices = extractChoices(rawText);
        
        // Nếu tìm thấy lựa chọn mới, cập nhật ngay vào UI
        // Nếu không, giữ nguyên (hoặc có thể clear nếu muốn mỗi lượt reset)
        if (extractedChoices.length > 0) {
            setQuickReplies(extractedChoices);
        } else {
            // Tùy chọn: Xóa các lựa chọn cũ nếu lượt này không có lựa chọn nào
            // setQuickReplies([]); 
        }

        // 1. Cập nhật biến số (Variable Engine)
        const { updatedVariables, cleanedText } = processVariableUpdates(rawText, variables);
        setVariables(updatedVariables);

        // 2. Chạy Regex và trích xuất HTML (Regex Service)
        const scripts = card?.extensions?.regex_scripts || [];
        const { displayContent, interactiveHtml } = processWithRegex(cleanedText, scripts, [2]);

        // 3. Cập nhật tin nhắn trong Store
        updateMessage(messageId, {
            content: displayContent,
            interactiveHtml,
            originalRawContent: rawText,
            contextState: updatedVariables
        });

        return { updatedVariables, displayContent, interactiveHtml };
    }, [variables, card, setVariables, updateMessage, setQuickReplies]);

    const createPlaceholderMessage = useCallback((role: 'model' | 'user' | 'system'): ChatMessage => {
        return {
            id: `msg-${Date.now()}`,
            role,
            content: '...',
            timestamp: Date.now()
        };
    }, []);

    return { processAIResponse, createPlaceholderMessage };
};

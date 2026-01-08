
import { useCallback } from 'react';
import type { CharacterCard, SillyTavernPreset, ChatMessage } from '../../types';
import { parseLooseJson } from '../../utils';
import { useChatStore } from '../../store/chatStore';

interface MessageManipulatorProps {
    saveSession: (data: any) => Promise<void>;
    
    // Dependencies
    card: CharacterCard | null;
    mergedSettings: SillyTavernPreset | null;
    
    // Logging & Status
    logSystemMessage: (level: any, source: any, message: string) => void;
    isBusy: boolean; 
}

export const useMessageManipulator = ({
    saveSession,
    card,
    mergedSettings,
    logSystemMessage,
    isBusy
}: MessageManipulatorProps) => {

    const {
        setMessages,
        setVariables,
        setLastStateBlock,
        setLongTermSummaries,
        setSummaryQueue,
        setSessionData // Needed to update card.rpg_data and WI state
    } = useChatStore();

    const deleteMessage = useCallback(async (messageId: string) => {
        if (isBusy) return;

        const state = useChatStore.getState();
        const messages = state.messages;
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        
        if (messageIndex === -1) return;

        // Cắt bỏ tin nhắn từ vị trí bị xóa trở đi
        const newMessages = messages.slice(0, messageIndex);
        
        // 1. Khôi phục Biến số (Variable Snapshot)
        let restoredVariables = {}; 
        let foundVarSnapshot = false;

        for (let i = newMessages.length - 1; i >= 0; i--) {
            if (newMessages[i].contextState) {
                restoredVariables = JSON.parse(JSON.stringify(newMessages[i].contextState));
                foundVarSnapshot = true;
                break;
            }
        }

        if (!foundVarSnapshot && card?.char_book?.entries) {
             const initVarEntry = card.char_book.entries.find(e => e.comment?.includes('[InitVar]'));
             if (initVarEntry?.content) {
                 try { 
                     restoredVariables = parseLooseJson(initVarEntry.content); 
                 } catch (e) {}
             }
        }

        // 2. Khôi phục Visual State (HTML)
        let restoredStateBlock = '';
        for (let i = newMessages.length - 1; i >= 0; i--) {
            if (newMessages[i].interactiveHtml) {
                restoredStateBlock = newMessages[i].interactiveHtml!;
                break;
            }
        }
        
        // 3. Khôi phục RPG State (Mythic Engine)
        let restoredRpgState = undefined;
        if (newMessages.length > 0) {
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg.rpgState) {
                restoredRpgState = JSON.parse(JSON.stringify(lastMsg.rpgState));
            }
        }
        
        if (restoredRpgState && card) {
             const updatedCard = { ...card, rpg_data: restoredRpgState };
             setSessionData({ card: updatedCard });
             logSystemMessage('state', 'system', 'RPG State restored from history snapshot.');
        }

        // 4. Khôi phục World Info State (Cooldowns & Toggles) - NEW
        let restoredWIRuntime = {};
        let restoredWIState = {};
        let foundWISnapshot = false;

        for (let i = newMessages.length - 1; i >= 0; i--) {
            // Find last snapshot of WI. Usually in User messages or System messages.
            if (newMessages[i].worldInfoRuntime) {
                restoredWIRuntime = JSON.parse(JSON.stringify(newMessages[i].worldInfoRuntime));
                if (newMessages[i].worldInfoState) {
                    restoredWIState = JSON.parse(JSON.stringify(newMessages[i].worldInfoState));
                }
                foundWISnapshot = true;
                break;
            }
        }
        
        if (foundWISnapshot) {
            setSessionData({ 
                worldInfoRuntime: restoredWIRuntime,
                worldInfoState: restoredWIState
            });
            logSystemMessage('state', 'system', 'World Info Cooldowns & State restored.');
        } else {
            // Fallback: If no snapshot found (start of chat), reset to empty
            setSessionData({ worldInfoRuntime: {} });
        }

        // 5. Cắt bớt Tóm tắt (Summaries) nếu cần
        if (mergedSettings) {
            const chunkSize = mergedSettings.summarization_chunk_size || 10;
            const validSummaryCount = Math.floor(newMessages.length / chunkSize);
            const longTermSummaries = state.longTermSummaries;
            
            if (validSummaryCount < longTermSummaries.length) {
                const newSummaries = longTermSummaries.slice(0, validSummaryCount);
                setLongTermSummaries(newSummaries);
                setSummaryQueue([]); 
                logSystemMessage('system', 'system', `Rewind: Truncated summaries to ${validSummaryCount} and cleared queue.`);
                
                await saveSession({ 
                    longTermSummaries: newSummaries, 
                    summaryQueue: [] 
                });
            }
        }

        // 6. Áp dụng State mới
        setVariables(restoredVariables);
        setLastStateBlock(restoredStateBlock);
        setMessages(newMessages);
        
        logSystemMessage('interaction', 'system', `Rewound chat to before message index ${messageIndex}. All states restored.`);

        // 7. Lưu Session
        await saveSession({
            messages: newMessages,
            variables: restoredVariables,
            lastStateBlock: restoredStateBlock
        });

    }, [card, mergedSettings, isBusy, saveSession, setMessages, setVariables, setLastStateBlock, setLongTermSummaries, setSummaryQueue, setSessionData, logSystemMessage]);

    const deleteLastTurn = useCallback(async () => {
        const messages = useChatStore.getState().messages;
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        let targetId = lastMsg.id;

        if (lastMsg.role === 'model' && messages.length >= 2) {
            const secondLast = messages[messages.length - 2];
            if (secondLast.role === 'user') {
                targetId = secondLast.id; 
            }
        }
        
        await deleteMessage(targetId);
    }, [deleteMessage]);

    const editMessage = useCallback(async (messageId: string, newContent: string) => {
        const state = useChatStore.getState();
        const messages = state.messages;
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        
        if (messageIndex === -1) return;
        
        const newMessages = [...messages];
        const updatedMessage = { ...newMessages[messageIndex], content: newContent };
        
        delete updatedMessage.interactiveHtml;
        delete updatedMessage.originalRawContent;
        
        newMessages[messageIndex] = updatedMessage;
        setMessages(newMessages);
        await saveSession({ messages: newMessages });
    }, [saveSession, setMessages]);

    return {
        deleteMessage,
        deleteLastTurn,
        editMessage
    };
};

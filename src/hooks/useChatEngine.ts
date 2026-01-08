
import { useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { useChatFlow } from './chat/useChatFlow';
import { useChatSession } from './useChatSession';
import { useChatMemory } from './useChatMemory';
import { useChatLogger } from './useChatLogger';
import { useChatInterface } from './chat/useChatInterface';
import { useMessageManipulator } from './chat/useMessageManipulator';
import { useChatCommands } from './chat/useChatCommands';

/**
 * useChatEngine: A unified aggregator for chat state and logic.
 */
export const useChatEngine = (sessionId: string | null) => {
    const store = useChatStore();
    const logger = useChatLogger();
    const { saveSession, changePreset } = useChatSession(sessionId);
    // Destructure new error handling props
    const { sendMessage, stopGeneration, interactiveError, handleUserDecision } = useChatFlow(); 
    const { 
        isSummarizing, 
        triggerSmartContext, 
        handleRegenerateSummary, 
        handleRetryFailedTask,
        queueLength,
        summaryQueue
    } = useChatMemory();
    
    const { 
        deleteMessage, 
        deleteLastTurn, 
        editMessage 
    } = useMessageManipulator({ 
        saveSession, 
        card: store.card, 
        mergedSettings: store.mergedSettings, 
        logSystemMessage: logger.logSystemMessage,
        isBusy: store.isLoading || isSummarizing
    });
    
    const { 
        handleScriptButtonClick,
        isInputLocked,
        setIsInputLocked,
        isAutoLooping,
        setIsAutoLooping,
        quickReplies,
        scriptButtons
    } = useChatInterface({ logSystemMessage: logger.logSystemMessage });

    const { executeSlashCommands } = useChatCommands({
        card: store.card,
        persona: store.persona,
        saveSession,
        sendMessage,
        addSystemMessage: (content) => store.addMessage({ id: `sys-${Date.now()}`, role: 'system', content }),
        logSystemMessage: logger.logSystemMessage,
        updateVisualState: (type, value) => store.setSessionData({ visualState: { ...store.visualState, [type]: value } }),
        showToast: (msg) => console.log('Toast:', msg),
        showPopup: (content) => console.log('Popup:', content),
    });

    // --- REGENERATE LOGIC (SAFE STATE ROLLBACK) ---
    // Moved here to access both deleteMessage (Manipulator) and sendMessage (Flow)
    const regenerateLastResponse = useCallback(async () => {
        const msgs = store.messages;
        if (msgs.length === 0 || store.isLoading) return;

        let targetUserMsgId: string | null = null;
        let textToSend = "";

        const lastMsg = msgs[msgs.length - 1];

        // Case 1: Last message is AI. We need to find the user message before it.
        if (lastMsg.role === 'model') {
            if (msgs.length >= 2) {
                const prev = msgs[msgs.length - 2];
                if (prev.role === 'user') {
                    targetUserMsgId = prev.id;
                    textToSend = prev.content;
                }
            }
        } 
        // Case 2: Last message is User (e.g., error case or manual stop).
        else if (lastMsg.role === 'user') {
            targetUserMsgId = lastMsg.id;
            textToSend = lastMsg.content;
        }

        if (targetUserMsgId && textToSend) {
            // 1. Rollback State (Variables, RPG, etc.) to BEFORE the user message
            await deleteMessage(targetUserMsgId);
            // 2. Re-send the message to trigger new generation
            await sendMessage(textToSend);
        } else {
            console.warn("Could not find a valid user message to regenerate from.");
        }
    }, [store.messages, store.isLoading, deleteMessage, sendMessage]);

    return {
        // State
        ...store,
        isSummarizing,
        queueLength,
        summaryQueue,
        isInputLocked,
        isAutoLooping,
        quickReplies,
        scriptButtons,
        interactiveError, // Export

        // Actions
        sendMessage,
        regenerateLastResponse, // Now uses the safe implementation
        stopGeneration, 
        deleteMessage,
        deleteLastTurn,
        editMessage,
        saveSession,
        changePreset,
        triggerSmartContext,
        handleRegenerateSummary,
        handleRetryFailedTask,
        handleScriptButtonClick,
        executeSlashCommands,
        handleUserDecision, // Export
        
        // Specific Setters
        setIsAutoLooping,
        updateAuthorNote: (note: string) => store.setSessionData({ authorNote: note }),
        updateWorldInfoState: (state: Record<string, boolean>) => store.setSessionData({ worldInfoState: state }),
        updateWorldInfoPinned: (pinned: Record<string, boolean>) => store.setSessionData({ worldInfoPinned: pinned }),
        updateWorldInfoPlacement: (placement: Record<string, 'before' | 'after' | undefined>) => store.setSessionData({ worldInfoPlacement: placement }),
        updateVisualState: (type: 'bg' | 'music' | 'sound' | 'class', value: string) => 
            store.setSessionData({ visualState: { ...store.visualState, [type]: value } }),
        clearLogs: logger.clearLogs,
    };
};

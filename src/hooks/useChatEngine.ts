
import { useCallback, useEffect, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { useChatFlow } from './chat/useChatFlow';
import { useChatSession } from './useChatSession';
import { useChatMemory, countTotalTurns } from './useChatMemory';
import { useChatLogger } from './useChatLogger';
import { useChatInterface } from './chat/useChatInterface';
import { useMessageManipulator } from './chat/useMessageManipulator';
import { useChatCommands } from './chat/useChatCommands';
import { useLorebook } from '../contexts/LorebookContext'; 
// MedusaService, syncDatabaseToLorebook, getApiKey REMOVED from here as they are now handled in useChatFlow

/**
 * useChatEngine: A unified aggregator for chat state and logic.
 */
export const useChatEngine = (sessionId: string | null) => {
    const store = useChatStore();
    const logger = useChatLogger();
    const { lorebooks } = useLorebook(); 
    const { saveSession, changePreset } = useChatSession(sessionId);
    
    // sendMessage now supports forcedContent for Story Mode
    const { sendMessage, stopGeneration, interactiveError, handleUserDecision, manualMythicTrigger, processAIResponse } = useChatFlow(); 
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

    // --- STORY MODE LOGIC ---
    const isStoryMode = store.storyQueue && store.storyQueue.length > 0;

    const advanceStoryChunk = useCallback(async () => {
        if (!store.storyQueue || store.storyQueue.length === 0 || store.isLoading || isSummarizing) return;

        const nextChunk = store.storyQueue[0];
        const remainingQueue = store.storyQueue.slice(1);

        // 1. Trigger the Unified Pipeline (Snapshot -> Smart Scan -> Logic -> RPG)
        // We pass "Tiếp tục..." as the user trigger, and nextChunk as the forced AI response.
        await sendMessage("Tiếp tục...", { forcedContent: nextChunk });

        // 2. Update Queue & Save State
        store.setStoryQueue(remainingQueue);
        await saveSession({ storyQueue: remainingQueue });

        // 3. Smart Context Check (Summarization)
        // Note: sendMessage adds 2 messages (User + AI), so we check length now.
        const currentMessages = store.messages; // State updated by sendMessage
        const turnCount = countTotalTurns(currentMessages);
        const contextLimit = store.preset?.context_depth || 24;

        if (turnCount >= contextLimit) {
            logger.logSystemMessage('warn', 'system', `[Story Mode] Đạt ngưỡng ngữ cảnh (${turnCount}/${contextLimit}). Đang tạm dừng để tóm tắt...`);
            await triggerSmartContext(); 
        }

    }, [store.storyQueue, store.isLoading, isSummarizing, sendMessage, saveSession, store.setStoryQueue, store.preset?.context_depth, store.messages, logger, triggerSmartContext]);

    // --- AUTO LOOP LOGIC (Story Mode - Synchronized) ---
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        
        // Điều kiện chạy Auto Loop:
        // 1. Phải đang bật AutoLoop và là Story Mode.
        // 2. KHÔNG đang tải (Loading) -> Chờ sendMessage/RPG xử lý xong.
        // 3. KHÔNG đang tóm tắt (Summarizing) -> Chờ bộ nhớ xử lý xong (QUAN TRỌNG).
        // 4. Không có lỗi.
        if (isAutoLooping && !store.isLoading && !isSummarizing && !store.error && isStoryMode) {
            timer = setTimeout(() => {
                advanceStoryChunk();
            }, 1000); // Fixed delay 1s
        }
        return () => clearTimeout(timer);
    }, [isAutoLooping, store.isLoading, isSummarizing, store.error, isStoryMode, advanceStoryChunk]);


    // --- REGENERATE LOGIC (SAFE STATE ROLLBACK) ---
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
        interactiveError, 
        isStoryMode, 

        // Actions
        sendMessage,
        regenerateLastResponse, 
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
        handleUserDecision, 
        handleRetryMythic: manualMythicTrigger,
        cancelStoryMode: store.clearStoryQueue, // Expose cancellation
        
        // Specific Setters
        setIsAutoLooping,
        updateAuthorNote: (note: string) => store.setSessionData({ authorNote: note }),
        updateWorldInfoState: (state: Record<string, boolean>) => store.setSessionData({ worldInfoState: state }),
        updateWorldInfoPinned: (pinned: Record<string, boolean>) => store.setSessionData({ worldInfoPinned: pinned }),
        updateWorldInfoPlacement: (placement: Record<string, 'before' | 'after' | undefined>) => store.setSessionData({ worldInfoPlacement: placement }),
        updateVisualState: (type: 'bg' | 'music' | 'sound' | 'class', value: string) => 
            store.setSessionData({ visualState: { ...store.visualState, [type]: value } }),
        clearLogs: logger.clearLogs,
        
        // Story Mode Actions
        advanceStoryChunk
    };
};

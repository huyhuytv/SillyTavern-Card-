
import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage, SummaryQueueItem } from '../types';
import { summarizeHistory } from '../services/geminiService';
import { dispatchSystemLog } from '../services/logBridge';

// Default values if not configured
const DEFAULT_CONTEXT_DEPTH = 20; 
const DEFAULT_CHUNK_SIZE = 10;

/**
 * Helper: Đếm tổng số lượt trong lịch sử trò chuyện.
 * Quy tắc:
 * - Tin nhắn đầu tiên (Index 0) tính là 1 lượt.
 * - Các tin nhắn tiếp theo của Model tính là kết thúc 1 lượt.
 */
export const countTotalTurns = (messages: ChatMessage[]): number => {
    if (messages.length === 0) return 0;
    let turns = 0;
    
    // Lượt 1: Luôn là tin nhắn đầu tiên (Greeting)
    if (messages.length > 0) turns++;

    // Quét từ tin nhắn thứ 2 trở đi
    for (let i = 1; i < messages.length; i++) {
        if (messages[i].role === 'model') {
            turns++;
        }
    }
    return turns;
};

/**
 * Helper: Tìm chỉ mục bắt đầu và kết thúc trong mảng tin nhắn dựa trên số lượt.
 */
const getSliceBoundsByTurns = (messages: ChatMessage[], startTurn: number, turnCount: number) => {
    let currentTurnIndex = 0;
    let startIndex = 0;
    let endIndex = 0;
    let foundStart = false;

    if (startTurn === 0) {
        foundStart = true;
        startIndex = 0;
    }

    for (let i = 0; i < messages.length; i++) {
        const isTurnEnd = (i === 0) || (messages[i].role === 'model');

        if (isTurnEnd) {
            if (!foundStart) {
                if (currentTurnIndex === startTurn - 1) {
                     startIndex = i + 1;
                     foundStart = true;
                     currentTurnIndex = 0; 
                } else {
                    currentTurnIndex++;
                }
            } else {
                currentTurnIndex++;
                if (currentTurnIndex === turnCount) {
                    endIndex = i + 1; 
                    break;
                }
            }
        }
    }
    
    if (foundStart && endIndex === 0) {
        endIndex = messages.length;
    }

    return { startIndex, endIndex, turnsFound: currentTurnIndex };
};

/**
 * Custom hook for managing the long-term memory of the chat through PERSISTENT QUEUE summarization.
 */
export const useChatMemory = (
    cardName: string,
    longTermSummaries: string[],
    setLongTermSummaries: (summaries: string[]) => void,
    summaryQueue: SummaryQueueItem[],
    setSummaryQueue: (queue: SummaryQueueItem[]) => void,
    saveSession: (data: any) => Promise<void>
) => {
    const [isGlobalSummarizing, setIsGlobalSummarizing] = useState<boolean>(false);
    const processingRef = useRef(false);

    /**
     * Initializes the queue.
     */
    const checkAndFillQueue = useCallback(async (
        messages: ChatMessage[],
        contextDepthTurns: number = DEFAULT_CONTEXT_DEPTH,
        chunkSizeTurns: number = DEFAULT_CHUNK_SIZE
    ) => {
        const safeChunkSize = Math.max(1, chunkSizeTurns);
        const safeContextDepth = Math.max(safeChunkSize + 1, contextDepthTurns);

        const totalTurns = countTotalTurns(messages);
        const coveredTurns = (longTermSummaries.length + summaryQueue.length) * safeChunkSize;
        const unsummarizedTurns = totalTurns - coveredTurns;

        if (unsummarizedTurns >= safeContextDepth) {
            dispatchSystemLog('log', 'system', `[Smart Context] Phát hiện tồn đọng: ${unsummarizedTurns} lượt. (Ngưỡng: ${safeContextDepth})`);
            
            const newQueueItems: SummaryQueueItem[] = [];
            
            let simulatedUnsummarized = unsummarizedTurns;
            let tasksCreated = 0;

            while (simulatedUnsummarized >= safeContextDepth) {
                newQueueItems.push({
                    id: `task_${Date.now()}_${tasksCreated}`,
                    status: 'pending',
                    timestamp: Date.now()
                });
                
                simulatedUnsummarized -= safeChunkSize;
                tasksCreated++;
                if (tasksCreated > 50) break; 
            }

            if (newQueueItems.length > 0) {
                const updatedQueue = [...summaryQueue, ...newQueueItems];
                setSummaryQueue(updatedQueue);
                await saveSession({ summaryQueue: updatedQueue });
                dispatchSystemLog('interaction', 'system', `[Smart Context] Đã thêm ${newQueueItems.length} tác vụ.`);
            }
        }
    }, [longTermSummaries.length, summaryQueue.length, setSummaryQueue, saveSession]);

    /**
     * The Queue Processor Watcher.
     * Only triggers if queue exists and first item is PENDING.
     * If first item is FAILED, we stop and wait for user intervention.
     */
    useEffect(() => {
        const processQueue = async () => {
            if (summaryQueue.length === 0 || processingRef.current) {
                setIsGlobalSummarizing(false);
                return;
            }

            // CHECK: If top item is failed, DO NOT proceed.
            if (summaryQueue[0].status === 'failed') {
                setIsGlobalSummarizing(false);
                return; 
            }

            setIsGlobalSummarizing(true);
            processingRef.current = true;
        };
        processQueue();
    }, [summaryQueue.length, summaryQueue[0]?.status]); // Depend on status change too

    /**
     * Executes ONE step.
     */
    const processQueueStep = useCallback(async (
        messages: ChatMessage[],
        summarizationPrompt?: string,
        chunkSizeTurns: number = DEFAULT_CHUNK_SIZE
    ) => {
        if (summaryQueue.length === 0) return;
        
        // Safety check: Don't process if failed
        if (summaryQueue[0].status === 'failed') {
            processingRef.current = false;
            setIsGlobalSummarizing(false);
            return;
        }

        processingRef.current = true;
        setIsGlobalSummarizing(true);

        try {
            const startTurnIndex = longTermSummaries.length * chunkSizeTurns;
            const { startIndex, endIndex, turnsFound } = getSliceBoundsByTurns(messages, startTurnIndex, chunkSizeTurns);

            if (startIndex >= messages.length || endIndex > messages.length || turnsFound < chunkSizeTurns) {
                dispatchSystemLog('warn', 'system', `⚠️ [CẢNH BÁO] Không đủ dữ liệu cho gói tóm tắt. Bỏ qua task.`);
                const nextQueue = summaryQueue.slice(1);
                setSummaryQueue(nextQueue);
                await saveSession({ summaryQueue: nextQueue });
                processingRef.current = false;
                return;
            }

            const historySlice = messages.slice(startIndex, endIndex);
            const summary = await summarizeHistory(historySlice, cardName, summarizationPrompt);

            if (summary) {
                // SUCCESS
                const newSummaries = [...longTermSummaries, summary];
                const nextQueue = summaryQueue.slice(1); 

                setLongTermSummaries(newSummaries);
                setSummaryQueue(nextQueue);

                await saveSession({
                    longTermSummaries: newSummaries,
                    summaryQueue: nextQueue
                });
                
                dispatchSystemLog('script-success', 'system', `[Smart Context] Tóm tắt thành công gói #${newSummaries.length}.`);
            } else {
                // FAILURE (Empty response)
                throw new Error("AI trả về nội dung tóm tắt rỗng.");
            }

        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            dispatchSystemLog('error', 'system', `[Smart Context] Lỗi: ${errMsg}. Đã tạm dừng hàng đợi.`);
            
            // UPDATE STATUS TO FAILED
            const failedItem = { ...summaryQueue[0], status: 'failed' as const, error: errMsg };
            const newQueue = [failedItem, ...summaryQueue.slice(1)];
            
            setSummaryQueue(newQueue);
            await saveSession({ summaryQueue: newQueue });
            
        } finally {
            processingRef.current = false;
            if (summaryQueue.length <= 1 && processingRef.current === false) { 
                 setIsGlobalSummarizing(false);
            }
        }
    }, [summaryQueue, longTermSummaries, cardName, setLongTermSummaries, setSummaryQueue, saveSession]);

    // --- MANUAL RETRY FUNCTION ---
    const retryFailedTask = useCallback(async (
        messages: ChatMessage[],
        summarizationPrompt?: string,
        chunkSizeTurns: number = DEFAULT_CHUNK_SIZE
    ) => {
        if (summaryQueue.length === 0) return;
        
        // 1. Reset Status to Pending
        const retryingItem = { ...summaryQueue[0], status: 'pending' as const, error: undefined };
        const newQueue = [retryingItem, ...summaryQueue.slice(1)];
        setSummaryQueue(newQueue);
        
        // 2. Force immediate run
        dispatchSystemLog('interaction', 'system', "[Smart Context] Đang thử lại tác vụ tóm tắt...");
        await processQueueStep(messages, summarizationPrompt, chunkSizeTurns);

    }, [summaryQueue, setSummaryQueue, processQueueStep]);


    const resetMemory = useCallback(async () => {
        setLongTermSummaries([]);
        setSummaryQueue([]);
        await saveSession({ longTermSummaries: [], summaryQueue: [] });
        setIsGlobalSummarizing(false);
        processingRef.current = false;
        dispatchSystemLog('warn', 'system', "[Smart Context] Đã đặt lại bộ nhớ dài hạn.");
    }, [saveSession, setLongTermSummaries, setSummaryQueue]);

    const regenerateSpecificSummary = useCallback(async (
        index: number,
        messages: ChatMessage[],
        summarizationPrompt?: string,
        chunkSizeTurns: number = DEFAULT_CHUNK_SIZE
    ) => {
        if (index < 0 || index >= longTermSummaries.length) throw new Error("Invalid summary index");

        const startTurnIndex = index * chunkSizeTurns;
        const { startIndex, endIndex, turnsFound } = getSliceBoundsByTurns(messages, startTurnIndex, chunkSizeTurns);

        dispatchSystemLog('state', 'system', `[Regenerate] Đang tạo lại tóm tắt #${index + 1}...`);

        if (turnsFound < chunkSizeTurns) {
             throw new Error("Không đủ lượt tin nhắn để tạo lại.");
        }

        const historySlice = messages.slice(startIndex, endIndex);
        const newSummary = await summarizeHistory(historySlice, cardName, summarizationPrompt);

        if (newSummary) {
            const newSummaries = [...longTermSummaries];
            newSummaries[index] = newSummary;
            setLongTermSummaries(newSummaries);
            await saveSession({ longTermSummaries: newSummaries });
            dispatchSystemLog('script-success', 'system', `[Regenerate] Đã cập nhật tóm tắt #${index + 1}.`);
        } else {
            throw new Error("AI trả về nội dung trống.");
        }

    }, [longTermSummaries, cardName, setLongTermSummaries, saveSession]);

    return {
        isGlobalSummarizing: isGlobalSummarizing || summaryQueue.length > 0,
        queueLength: summaryQueue.length,
        summaryQueue, // Export full queue for UI
        checkAndFillQueue,
        processQueueStep,
        resetMemory,
        regenerateSpecificSummary,
        retryFailedTask // Export Retry Function
    };
};

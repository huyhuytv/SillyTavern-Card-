
import { useCallback, useState, useRef } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useResponseHandler } from './useResponseHandler';
import { constructChatPrompt, prepareChat } from '../../services/promptManager';
import { sendChatRequestStream, sendChatRequest } from '../../services/geminiService';
import { useLorebook } from '../../contexts/LorebookContext';
import { useChatLogger } from '../useChatLogger';
import { useWorldSystem } from '../useWorldSystem';
import { MedusaService } from '../../services/medusaService'; 
import { getApiKey } from '../../services/settingsService';
import { useToast } from '../../components/ToastSystem';
import type { WorldInfoEntry, InteractiveErrorState } from '../../types';

export const useChatFlow = () => {
    const state = useChatStore();
    const { processAIResponse, createPlaceholderMessage } = useResponseHandler();
    const { lorebooks } = useLorebook();
    const logger = useChatLogger();
    const { scanInput } = useWorldSystem(state.card);
    const { showToast } = useToast();

    // --- INTERACTIVE ERROR STATE ---
    const [interactiveError, setInteractiveError] = useState<InteractiveErrorState>({
        hasError: false,
        title: '',
        message: '',
        canIgnore: true
    });
    
    // Resolver ref để giữ hàm resolve của Promise khi tạm dừng
    const errorResolverRef = useRef<((decision: 'retry' | 'ignore') => void) | null>(null);

    // Hàm gọi Modal và đợi người dùng chọn
    const waitForUserDecision = useCallback((title: string, message: string, errorDetails: any, canIgnore: boolean = true): Promise<'retry' | 'ignore'> => {
        return new Promise((resolve) => {
            const errorStr = errorDetails instanceof Error ? errorDetails.message : String(errorDetails);
            
            setInteractiveError({
                hasError: true,
                title,
                message,
                errorDetails: errorStr,
                canIgnore
            });
            
            // Lưu hàm resolve vào ref để gọi từ bên ngoài (UI)
            errorResolverRef.current = resolve;
        });
    }, []);

    const handleUserDecision = useCallback((decision: 'retry' | 'ignore') => {
        setInteractiveError(prev => ({ ...prev, hasError: false })); // Đóng modal
        if (errorResolverRef.current) {
            errorResolverRef.current(decision);
            errorResolverRef.current = null;
        }
    }, []);

    // --- STOP GENERATION ---
    const stopGeneration = useCallback(() => {
        if (state.abortController) {
            state.abortController.abort();
            state.setAbortController(null);
            state.setLoading(false);
            logger.logSystemMessage('interaction', 'system', 'Người dùng đã dừng quá trình tạo.');
        }
    }, [state, logger]);

    const sendMessage = useCallback(async (text: string) => {
        if (!state.card || !state.preset || !text.trim()) return;

        // 1. Reset trạng thái
        state.setError(null);
        state.setLoading(true);
        logger.startTurn();

        const ac = new AbortController();
        state.setAbortController(ac);

        // --- SNAPSHOT CREATION (Time Machine) ---
        // Clone current states BEFORE any processing to save in the message
        const currentVariablesSnapshot = JSON.parse(JSON.stringify(state.variables));
        const currentRpgSnapshot = state.card.rpg_data ? JSON.parse(JSON.stringify(state.card.rpg_data)) : undefined;
        const currentWIRuntimeSnapshot = JSON.parse(JSON.stringify(state.worldInfoRuntime));
        const currentWIStateSnapshot = JSON.parse(JSON.stringify(state.worldInfoState));
        // ----------------------------------------
        
        const userMsg = { 
            id: `u-${Date.now()}`, 
            role: 'user' as const, 
            content: text, 
            timestamp: Date.now(),
            
            // Store Full State
            contextState: currentVariablesSnapshot,
            rpgState: currentRpgSnapshot,
            worldInfoRuntime: currentWIRuntimeSnapshot, // NEW
            worldInfoState: currentWIStateSnapshot      // NEW
        };
        state.addMessage(userMsg);

        try {
            // 4. Smart Scan (World Info) - WITH RETRY LOGIC
            let scanResult;
            let retryScan = true;
            let forceKeywordMode = false; // Flag cho trường hợp "Bỏ qua" (Ignore)

            while (retryScan) {
                try {
                    const recentHistoryText = state.messages.slice(-3).map(m => m.content).join('\n');
                    const textToScan = `${recentHistoryText}\n${text}`;
                    const historyList = state.messages.map(m => m.content).slice(-3);

                    // Nếu bị ép dùng Keyword Mode (do user chọn Ignore lỗi AI), ta tạo preset tạm
                    const effectivePreset = forceKeywordMode 
                        ? { ...state.preset, smart_scan_mode: 'keyword' as const } 
                        : state.preset;

                    scanResult = await scanInput(
                        textToScan, 
                        state.worldInfoState, 
                        state.worldInfoRuntime, 
                        state.worldInfoPinned,
                        effectivePreset,
                        historyList, 
                        text, 
                        state.variables
                    );
                    
                    retryScan = false; // Thành công, thoát vòng lặp

                } catch (e: any) {
                    logger.logSystemMessage('error', 'system', `Smart Scan Error: ${e.message}`);
                    
                    // Hiện Modal hỏi ý kiến
                    const decision = await waitForUserDecision(
                        "Lỗi Smart Scan (Quét Thông Minh)",
                        "Hệ thống gặp lỗi khi cố gắng phân tích ngữ cảnh bằng AI. Bạn muốn thử lại hay chuyển sang chế độ quét từ khóa cơ bản?",
                        e
                    );

                    if (decision === 'retry') {
                        retryScan = true; // Loop lại
                        logger.logSystemMessage('interaction', 'system', 'Người dùng chọn: Thử lại Smart Scan.');
                    } else {
                        retryScan = false; // Thoát vòng lặp
                        forceKeywordMode = true; // Bật cờ để chạy fallback logic bên dưới
                        
                        // Để đơn giản, ta chạy lại vòng lặp NGAY LẬP TỨC với cờ forceKeywordMode
                        retryScan = true; 
                        logger.logSystemMessage('warn', 'system', 'Người dùng chọn: Bỏ qua lỗi, chuyển sang quét từ khóa.');
                    }
                }
            }
            
            // Nếu scanResult vẫn null (trường hợp cực hữu), fallback object rỗng
            if (!scanResult) {
                 scanResult = { activeEntries: [], updatedRuntimeState: state.worldInfoRuntime };
            }

            state.setSessionData({ worldInfoRuntime: scanResult.updatedRuntimeState });
            
            // 5. Chuẩn bị Prompt
            const { baseSections } = prepareChat(state.card, state.preset, lorebooks, state.persona);
            logger.logPrompt(baseSections); 

            const { fullPrompt, structuredPrompt } = await constructChatPrompt(
                baseSections, 
                [...state.messages, userMsg], 
                state.authorNote,
                state.card, 
                state.longTermSummaries, 
                state.preset.summarization_chunk_size || 10,
                state.variables, 
                state.lastStateBlock, 
                lorebooks,
                state.preset.context_mode || 'standard',
                state.persona?.name || 'User',
                state.worldInfoState,
                scanResult.activeEntries, 
                state.worldInfoPlacement,
                state.preset
            );

            logger.logPrompt(structuredPrompt); 
            if (scanResult.smartScanLog) {
                logger.logSmartScan(scanResult.smartScanLog.fullPrompt, scanResult.smartScanLog.rawResponse, scanResult.smartScanLog.latency);
            }
            logger.logWorldInfo(scanResult.activeEntries);

            // 6. Tạo tin nhắn chờ của AI
            const aiMsg = createPlaceholderMessage('model');
            // Attach initial state to AI msg too (will be updated if Medusa runs)
            aiMsg.rpgState = currentRpgSnapshot;
            // Also attach runtime state to AI msg so if we delete FROM AI message, we have context
            aiMsg.worldInfoRuntime = scanResult.updatedRuntimeState; 
            
            state.addMessage(aiMsg);

            // 7. Thực hiện gọi API
            let accumulatedText = "";
            const shouldStream = state.preset.stream_response; 

            if (shouldStream) {
                const stream = sendChatRequestStream(fullPrompt, state.preset, ac.signal);
                for await (const chunk of stream) {
                    if (ac.signal.aborted) break;
                    accumulatedText += chunk;
                    state.updateMessage(aiMsg.id, { content: accumulatedText + " ▌" });
                }
            } else {
                state.updateMessage(aiMsg.id, { content: "..." }); 
                const result = await sendChatRequest(fullPrompt, state.preset);
                if (!ac.signal.aborted) {
                    accumulatedText = result.response.text || "";
                    state.updateMessage(aiMsg.id, { content: accumulatedText });
                }
            }

            // 8. Xử lý hậu kỳ & Mythic Engine
            if (!ac.signal.aborted) {
                await processAIResponse(accumulatedText, aiMsg.id);
                logger.logResponse(accumulatedText);

                // --- VÒNG LẶP 2: MYTHIC ENGINE (RPG SYSTEM) - WITH RETRY LOGIC ---
                if (state.card.rpg_data) {
                    logger.logSystemMessage('state', 'system', 'Mythic Engine: Đang kích hoạt Medusa...');
                    const apiKey = getApiKey();
                    
                    if (apiKey) {
                        let retryMedusa = true;
                        
                        while (retryMedusa) {
                            try {
                                const mythicStartTime = Date.now();
                                let historyLog = `User: ${text}\nGM/System: ${accumulatedText}`;
                                
                                if (state.messages.length <= 3) {
                                    const greetingMsg = state.messages.find(m => m.role === 'model');
                                    if (greetingMsg && greetingMsg.content) {
                                        historyLog = `System (Context/Greeting): ${greetingMsg.content}\n\n${historyLog}`;
                                    }
                                }
                                
                                let allEntries: WorldInfoEntry[] = state.card.char_book?.entries || [];
                                lorebooks.forEach(lb => {
                                    if (lb.book?.entries) allEntries = [...allEntries, ...lb.book.entries];
                                });

                                const dynamicActiveEntries = scanResult.activeEntries.filter(e => !e.constant);

                                const medusaResult = await MedusaService.processTurn(
                                    historyLog,
                                    state.card.rpg_data,
                                    apiKey,
                                    dynamicActiveEntries,
                                    allEntries,
                                    'gemini-flash-lite-latest'
                                );

                                if (medusaResult.debugInfo) {
                                    const latency = Date.now() - mythicStartTime;
                                    logger.logMythic(medusaResult.debugInfo.prompt, medusaResult.debugInfo.rawResponse, latency);
                                }

                                if (medusaResult.success) {
                                    const updatedCard = { ...state.card, rpg_data: medusaResult.newDb };
                                    
                                    state.setSessionData({ card: updatedCard });
                                    state.updateMessage(aiMsg.id, { rpgState: medusaResult.newDb });
                                    
                                    if (medusaResult.logs && medusaResult.logs.length > 0) {
                                        logger.logSystemMessage('script-success', 'system', `[RPG Update]:\n${medusaResult.logs.join('\n')}`);
                                    } else {
                                        logger.logSystemMessage('state', 'system', '[RPG] Không có thay đổi trạng thái.');
                                    }

                                    if (medusaResult.notifications && medusaResult.notifications.length > 0) {
                                        medusaResult.notifications.forEach(note => {
                                            showToast(note, 'info');
                                        });
                                    }
                                    retryMedusa = false; // Success
                                } else {
                                    throw new Error('error' in medusaResult ? medusaResult.error : "Unknown RPG Error");
                                }

                            } catch (e: any) {
                                logger.logSystemMessage('error', 'system', `Mythic Engine Error: ${e.message}`);
                                
                                const decision = await waitForUserDecision(
                                    "Lỗi Mythic Engine (RPG)",
                                    "Hệ thống RPG không thể cập nhật trạng thái thế giới. Bạn muốn thử lại hay bỏ qua (giữ nguyên trạng thái cũ)?",
                                    e
                                );

                                if (decision === 'retry') {
                                    retryMedusa = true;
                                    logger.logSystemMessage('interaction', 'system', 'Người dùng chọn: Thử lại Mythic Engine.');
                                } else {
                                    retryMedusa = false;
                                    logger.logSystemMessage('warn', 'system', 'Người dùng chọn: Bỏ qua lỗi RPG.');
                                }
                            }
                        }
                    } else {
                        logger.logSystemMessage('warn', 'system', '[RPG] Bỏ qua Medusa vì không tìm thấy API Key.');
                    }
                }
                // --------------------------------------------------

            } else if (shouldStream) {
                state.updateMessage(aiMsg.id, { content: accumulatedText });
            }

        } catch (err: any) {
            if (err.message !== 'Aborted') {
                console.error(err);
                state.setError(`Lỗi: ${err.message}`);
                state.updateMessage('temp_ai_error', { content: "⚠️ Lỗi: Không thể nhận phản hồi từ AI." });
                logger.logSystemMessage('api-error', 'api', err.message);
            }
        } finally {
            state.setLoading(false);
            state.setAbortController(null);
        }
    }, [state, lorebooks, createPlaceholderMessage, processAIResponse, logger, scanInput, showToast, waitForUserDecision]); // Dependencies updated

    return { 
        sendMessage, 
        stopGeneration,
        interactiveError,
        handleUserDecision 
    };
};

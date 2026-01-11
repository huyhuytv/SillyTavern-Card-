
import { useCallback, useState, useRef } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useResponseHandler } from './useResponseHandler';
import { constructChatPrompt, prepareChat } from '../../services/promptManager';
import { sendChatRequestStream, sendChatRequest } from '../../services/geminiService';
import { useLorebook } from '../../contexts/LorebookContext';
import { useChatLogger } from '../useChatLogger';
import { useWorldSystem } from '../useWorldSystem';
import { MedusaService, syncDatabaseToLorebook } from '../../services/medusaService'; 
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

    // --- MANUAL MYTHIC TRIGGER ---
    const manualMythicTrigger = useCallback(async () => {
        if (!state.card || !state.card.rpg_data) {
            showToast('Không tìm thấy dữ liệu RPG để xử lý.', 'warning');
            return;
        }

        const msgs = state.messages;
        if (msgs.length < 2) {
            showToast('Lịch sử trò chuyện chưa đủ để phân tích.', 'warning');
            return;
        }

        // Tìm lượt hội thoại cuối cùng (Model + User ngay trước đó)
        let lastModelMsg = null;
        let lastUserMsg = null;

        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'model') {
                lastModelMsg = msgs[i];
                // Tìm User ngay trước đó
                for (let j = i - 1; j >= 0; j--) {
                    if (msgs[j].role === 'user') {
                        lastUserMsg = msgs[j];
                        break;
                    }
                }
                break;
            }
        }

        if (!lastModelMsg || !lastUserMsg) {
            showToast('Không tìm thấy ngữ cảnh hợp lệ (User + AI) để chạy lại RPG.', 'warning');
            return;
        }

        const apiKey = getApiKey();
        if (!apiKey) {
            showToast('Chưa cấu hình API Key.', 'error');
            return;
        }

        logger.logSystemMessage('interaction', 'system', 'Đang buộc chạy lại Mythic Engine...');
        state.setLoading(true);

        try {
            // LOOP FOR MANUAL RETRY
            let retryMedusa = true;
            
            while(retryMedusa) {
                try {
                    const mythicStartTime = Date.now();
                    let historyLog = `User: ${lastUserMsg.content}\nGM/System: ${lastModelMsg.content}`;
                    
                    let allEntries: WorldInfoEntry[] = state.card.char_book?.entries || [];
                    lorebooks.forEach(lb => {
                        if (lb.book?.entries) allEntries = [...allEntries, ...lb.book.entries];
                    });

                    const activeEntries: WorldInfoEntry[] = []; 

                    const medusaResult = await MedusaService.processTurn(
                        historyLog,
                        state.card.rpg_data,
                        apiKey,
                        activeEntries,
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
                        
                        state.updateMessage(lastModelMsg.id, { rpgState: medusaResult.newDb });

                        if (medusaResult.logs && medusaResult.logs.length > 0) {
                            logger.logSystemMessage('script-success', 'system', `[RPG Re-run]:\n${medusaResult.logs.join('\n')}`);
                        }
                        
                        if (medusaResult.notifications && medusaResult.notifications.length > 0) {
                            const notificationText = medusaResult.notifications.join('\n');
                            state.setRpgNotification(notificationText);
                        } else {
                            state.setRpgNotification(null);
                        }

                        const generatedEntries = syncDatabaseToLorebook(medusaResult.newDb);
                        state.setGeneratedLorebookEntries(generatedEntries);
                        if (generatedEntries.length > 0) {
                            logger.logSystemMessage('state', 'system', `[Live-Link] Synced ${generatedEntries.length} entries from RPG.`);
                        }

                        showToast('Đã cập nhật trạng thái RPG thành công.', 'success');
                        retryMedusa = false; // Done
                    } else {
                        throw new Error('error' in medusaResult ? medusaResult.error : "Unknown RPG Error");
                    }
                } catch (e: any) {
                    logger.logSystemMessage('error', 'system', `Mythic Engine Manual Error: ${e.message}`);
                    const decision = await waitForUserDecision(
                        "Lỗi Mythic Engine (Thủ công)",
                        "Hệ thống RPG gặp lỗi khi chạy thủ công. Bạn muốn thử lại hay hủy bỏ?",
                        e
                    );
                    if (decision === 'retry') retryMedusa = true;
                    else retryMedusa = false;
                }
            }

        } catch (e: any) {
            // Should not reach here if loop handled correctly, but safety net
            logger.logSystemMessage('error', 'system', `Final Mythic Error: ${e.message}`);
        } finally {
            state.setLoading(false);
        }

    }, [state, lorebooks, logger, showToast, waitForUserDecision]);

    // --- UNIFIED SEND MESSAGE ---
    const sendMessage = useCallback(async (text: string, options?: { forcedContent?: string }) => {
        if (!state.card || !state.preset || !text.trim()) return;

        // 1. Reset trạng thái
        state.setError(null);
        state.setLoading(true);
        logger.startTurn();

        const ac = new AbortController();
        state.setAbortController(ac);

        // --- SNAPSHOT CREATION ---
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
            worldInfoRuntime: currentWIRuntimeSnapshot,
            worldInfoState: currentWIStateSnapshot
        };
        state.addMessage(userMsg);

        try {
            // 4. Smart Scan (World Info) - WITH RETRY LOGIC VIA MODAL
            let scanResult;
            let retryScan = true;
            let forceKeywordMode = false;

            const dynamicEntries = state.generatedLorebookEntries || [];

            while (retryScan) {
                try {
                    const recentHistoryText = state.messages.slice(-3).map(m => m.content).join('\n');
                    
                    const textToScan = options?.forcedContent 
                        ? `${recentHistoryText}\n${text}\n${options.forcedContent}`
                        : `${recentHistoryText}\n${text}`;
                        
                    const historyList = state.messages.map(m => m.content).slice(-3);

                    const effectivePreset = forceKeywordMode 
                        ? { ...state.preset, smart_scan_mode: 'keyword' as const } 
                        : state.preset;

                    // This now throws an error if AI fails
                    scanResult = await scanInput(
                        textToScan, 
                        state.worldInfoState, 
                        state.worldInfoRuntime, 
                        state.worldInfoPinned,
                        effectivePreset,
                        historyList, 
                        text, 
                        state.variables,
                        dynamicEntries
                    );
                    
                    retryScan = false; // Success

                } catch (e: any) {
                    logger.logSystemMessage('error', 'system', `Smart Scan Error: ${e.message}`);
                    
                    const decision = await waitForUserDecision(
                        "Lỗi Smart Scan (Quét Thông Minh)",
                        "Hệ thống gặp lỗi khi cố gắng phân tích ngữ cảnh bằng AI. Bạn muốn thử lại hay chuyển sang chế độ quét từ khóa cơ bản?",
                        e
                    );

                    if (decision === 'retry') {
                        retryScan = true;
                        logger.logSystemMessage('interaction', 'system', 'Người dùng chọn: Thử lại Smart Scan.');
                    } else {
                        // Ignore implies fallback to keyword or empty
                        retryScan = false;
                        forceKeywordMode = true; 
                        
                        // We need one last run with keyword mode to get a valid result structure if we "Ignore/Fallback"
                        // Or simply re-enter loop with forceKeywordMode set
                        retryScan = true; 
                        logger.logSystemMessage('warn', 'system', 'Người dùng chọn: Bỏ qua lỗi, chuyển sang quét từ khóa.');
                    }
                }
            }
            
            if (!scanResult) {
                 scanResult = { activeEntries: [], updatedRuntimeState: state.worldInfoRuntime };
            }

            // Apply new World Info Runtime State
            state.setSessionData({ worldInfoRuntime: scanResult.updatedRuntimeState });
            logger.logWorldInfo(scanResult.activeEntries);
            if (scanResult.smartScanLog) {
                logger.logSmartScan(scanResult.smartScanLog.fullPrompt, scanResult.smartScanLog.rawResponse, scanResult.smartScanLog.latency);
            }
            
            // 5. Prepare Prompt
            let fullPrompt = "";
            
            if (!options?.forcedContent) {
                const sessionLorebook = { name: "Session Generated", book: { entries: dynamicEntries } };
                const effectiveLorebooks = [...lorebooks, sessionLorebook];

                const { baseSections } = prepareChat(state.card, state.preset, effectiveLorebooks, state.persona);
                logger.logPrompt(baseSections); 

                const constructed = await constructChatPrompt(
                    baseSections, 
                    [...state.messages, userMsg], 
                    state.authorNote,
                    state.card, 
                    state.longTermSummaries, 
                    state.preset.summarization_chunk_size || 10,
                    state.variables, 
                    state.lastStateBlock, 
                    effectiveLorebooks,
                    state.preset.context_mode || 'standard',
                    state.persona?.name || 'User',
                    state.worldInfoState,
                    scanResult.activeEntries, 
                    state.worldInfoPlacement,
                    state.preset
                );
                fullPrompt = constructed.fullPrompt;
                logger.logPrompt(constructed.structuredPrompt); 
            }

            // 6. Placeholder AI Message
            const aiMsg = createPlaceholderMessage('model');
            aiMsg.rpgState = currentRpgSnapshot;
            aiMsg.worldInfoRuntime = scanResult.updatedRuntimeState; 
            
            state.addMessage(aiMsg);

            // 7. Fetch Content
            let accumulatedText = "";
            
            if (options?.forcedContent) {
                accumulatedText = options.forcedContent;
                state.updateMessage(aiMsg.id, { content: accumulatedText });
            } else {
                const shouldStream = state.preset.stream_response; 

                // MAIN CHAT GENERATION LOOP FOR ERRORS
                let retryGeneration = true;
                while (retryGeneration) {
                    try {
                        if (shouldStream) {
                            const stream = sendChatRequestStream(fullPrompt, state.preset, ac.signal);
                            let streamText = "";
                            for await (const chunk of stream) {
                                if (ac.signal.aborted) break;
                                streamText += chunk;
                                state.updateMessage(aiMsg.id, { content: streamText + " ▌" });
                            }
                            accumulatedText = streamText;
                        } else {
                            state.updateMessage(aiMsg.id, { content: "..." }); 
                            const result = await sendChatRequest(fullPrompt, state.preset);
                            if (!ac.signal.aborted) {
                                accumulatedText = result.response.text || "";
                                state.updateMessage(aiMsg.id, { content: accumulatedText });
                            }
                        }
                        retryGeneration = false; // Success
                    } catch (err: any) {
                        if (ac.signal.aborted) {
                            retryGeneration = false;
                            throw err; // Re-throw abort
                        }
                        
                        logger.logSystemMessage('api-error', 'api', err.message);
                        
                        const decision = await waitForUserDecision(
                            "Lỗi Kết Nối AI",
                            "Không thể nhận phản hồi từ AI. (Lỗi mạng, API Key hoặc Proxy). Bạn muốn thử lại không?",
                            err
                        );
                        
                        if (decision === 'retry') {
                            retryGeneration = true;
                            state.updateMessage(aiMsg.id, { content: "Đang thử lại..." });
                        } else {
                            retryGeneration = false;
                            state.updateMessage(aiMsg.id, { content: "⚠️ (Đã bỏ qua lỗi - Không có nội dung)" });
                            accumulatedText = ""; // Empty content if ignored
                        }
                    }
                }
            }

            // 8. Post-Processing & Mythic Engine
            if (!ac.signal.aborted) {
                await processAIResponse(accumulatedText, aiMsg.id);
                logger.logResponse(accumulatedText);

                // --- VÒNG LẶP 2: MYTHIC ENGINE (RPG SYSTEM) ---
                if (state.card.rpg_data) {
                    logger.logSystemMessage('state', 'system', 'Mythic Engine: Đang kích hoạt Medusa...');
                    const apiKey = getApiKey();
                    
                    // We also want user decision here for missing key
                    let hasKey = !!apiKey;
                    // Note: If using proxy, apiKey might not be needed depending on setup, but MedusaService handles checks. 
                    // Let's assume MedusaService throws if config is invalid.

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

                            // MedusaService now catches generic errors and returns success:false
                            // BUT for network/critical errors it might throw. 
                            // AND if success:false, we might want to prompt user if it's a critical logic failure?
                            // Actually MedusaService.processTurn catches internal errors and returns them in the result object.
                            // We should check result.success.

                            const medusaResult = await MedusaService.processTurn(
                                historyLog,
                                state.card.rpg_data,
                                apiKey || 'dummy', // Pass dummy if missing, let service fail if needed
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
                                }

                                if (medusaResult.notifications && medusaResult.notifications.length > 0) {
                                    const notificationText = medusaResult.notifications.join('\n');
                                    state.setRpgNotification(notificationText);
                                } else {
                                    state.setRpgNotification(null);
                                }
                                
                                const generatedEntries = syncDatabaseToLorebook(medusaResult.newDb);
                                state.setGeneratedLorebookEntries(generatedEntries);
                                if (generatedEntries.length > 0) {
                                    logger.logSystemMessage('state', 'system', `[Live-Link] Synced ${generatedEntries.length} entries from RPG.`);
                                }

                                retryMedusa = false; // Success
                            } else {
                                // Explicitly throw to trigger the catch block below
                                throw new Error('error' in medusaResult ? medusaResult.error : "Unknown RPG Error");
                            }

                        } catch (e: any) {
                            logger.logSystemMessage('error', 'system', `Mythic Engine Error: ${e.message}`);
                            
                            const decision = await waitForUserDecision(
                                "Lỗi Mythic Engine (RPG)",
                                "Hệ thống RPG không thể cập nhật trạng thái thế giới (Lỗi Phân tích hoặc Kết nối). Bạn muốn thử lại hay bỏ qua?",
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
                }
                // --------------------------------------------------

            } else if (!options?.forcedContent && state.preset.stream_response) {
                state.updateMessage(aiMsg.id, { content: accumulatedText });
            }

        } catch (err: any) {
            if (err.message !== 'Aborted') {
                // Global catch for unhandled sync errors
                console.error(err);
                state.setError(`Lỗi không mong đợi: ${err.message}`);
                logger.logSystemMessage('api-error', 'system', err.message);
                
                // Final safety net modal
                await waitForUserDecision("Lỗi Nghiêm Trọng", "Một lỗi không mong đợi đã xảy ra trong luồng xử lý.", err);
            }
        } finally {
            state.setLoading(false);
            state.setAbortController(null);
        }
    }, [state, lorebooks, createPlaceholderMessage, processAIResponse, logger, scanInput, showToast, waitForUserDecision]); 

    return { 
        sendMessage, 
        stopGeneration,
        interactiveError,
        handleUserDecision,
        manualMythicTrigger,
        processAIResponse 
    };
};

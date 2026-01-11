
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
            const mythicStartTime = Date.now();
            let historyLog = `User: ${lastUserMsg.content}\nGM/System: ${lastModelMsg.content}`;
            
            // Gather Lorebook Data
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
                
                // Update state vào tin nhắn cuối để đồng bộ
                state.updateMessage(lastModelMsg.id, { rpgState: medusaResult.newDb });

                if (medusaResult.logs && medusaResult.logs.length > 0) {
                    logger.logSystemMessage('script-success', 'system', `[RPG Re-run]:\n${medusaResult.logs.join('\n')}`);
                }
                
                // --- NEW: SET PERSISTENT NOTIFICATION ---
                if (medusaResult.notifications && medusaResult.notifications.length > 0) {
                    const notificationText = medusaResult.notifications.join('\n');
                    state.setRpgNotification(notificationText);
                } else {
                    state.setRpgNotification(null); // Clear if no new notifications
                }
                // ----------------------------------------

                // --- LIVE LINK SYNC ---
                const generatedEntries = syncDatabaseToLorebook(medusaResult.newDb);
                state.setGeneratedLorebookEntries(generatedEntries);
                if (generatedEntries.length > 0) {
                    logger.logSystemMessage('state', 'system', `[Live-Link] Synced ${generatedEntries.length} entries from RPG.`);
                }
                // ---------------------

                showToast('Đã cập nhật trạng thái RPG thành công.', 'success');
            } else {
                throw new Error('error' in medusaResult ? medusaResult.error : "Unknown RPG Error");
            }

        } catch (e: any) {
            logger.logSystemMessage('error', 'system', `Mythic Engine Manual Error: ${e.message}`);
            showToast(`Lỗi RPG: ${e.message}`, 'error');
        } finally {
            state.setLoading(false);
        }

    }, [state, lorebooks, logger, showToast]);

    // --- UNIFIED SEND MESSAGE ---
    // Modified to accept 'options' including 'forcedContent' for Story Mode
    const sendMessage = useCallback(async (text: string, options?: { forcedContent?: string }) => {
        if (!state.card || !state.preset || !text.trim()) return;

        // 1. Reset trạng thái
        state.setError(null);
        state.setLoading(true);
        logger.startTurn();

        const ac = new AbortController();
        state.setAbortController(ac);

        // --- SNAPSHOT CREATION (Time Machine) ---
        // Clone current states BEFORE any processing to save in the message
        // This ensures if we undo/delete this message, we go back to EXACTLY this state.
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
            // 4. Smart Scan (World Info) - WITH RETRY LOGIC
            let scanResult;
            let retryScan = true;
            let forceKeywordMode = false;

            const dynamicEntries = state.generatedLorebookEntries || [];

            while (retryScan) {
                try {
                    const recentHistoryText = state.messages.slice(-3).map(m => m.content).join('\n');
                    
                    // IMPORTANT: Include the UPCOMING content in scan if available (Story Mode prediction)
                    const textToScan = options?.forcedContent 
                        ? `${recentHistoryText}\n${text}\n${options.forcedContent}`
                        : `${recentHistoryText}\n${text}`;
                        
                    const historyList = state.messages.map(m => m.content).slice(-3);

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
                        state.variables,
                        dynamicEntries
                    );
                    
                    retryScan = false;

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
                        retryScan = false;
                        forceKeywordMode = true;
                        // Important: Need to re-run loop one last time with keyword mode to get a result
                        retryScan = true; 
                        logger.logSystemMessage('warn', 'system', 'Người dùng chọn: Bỏ qua lỗi, chuyển sang quét từ khóa.');
                    }
                }
            }
            
            if (!scanResult) {
                 scanResult = { activeEntries: [], updatedRuntimeState: state.worldInfoRuntime };
            }

            // Apply new World Info Runtime State (Cooldowns etc.)
            state.setSessionData({ worldInfoRuntime: scanResult.updatedRuntimeState });
            logger.logWorldInfo(scanResult.activeEntries);
            if (scanResult.smartScanLog) {
                logger.logSmartScan(scanResult.smartScanLog.fullPrompt, scanResult.smartScanLog.rawResponse, scanResult.smartScanLog.latency);
            }
            
            // 5. Chuẩn bị Prompt (SKIP if Story Mode to save tokens/time, unless needed later)
            // Actually, we should only construct prompt if we are hitting the API.
            let fullPrompt = "";
            
            if (!options?.forcedContent) {
                // Mock effective lorebook list for prompt construction
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

            // 6. Tạo tin nhắn AI (Placeholder)
            const aiMsg = createPlaceholderMessage('model');
            // Attach snapshots to AI msg too
            aiMsg.rpgState = currentRpgSnapshot;
            aiMsg.worldInfoRuntime = scanResult.updatedRuntimeState; 
            
            state.addMessage(aiMsg);

            // 7. Thực hiện lấy nội dung (API vs Queue)
            let accumulatedText = "";
            
            if (options?.forcedContent) {
                // STORY MODE PATH: Immediate content, no API call
                accumulatedText = options.forcedContent;
                state.updateMessage(aiMsg.id, { content: accumulatedText });
                // No streaming delay requested by user
            } else {
                // CHAT MODE PATH: Call API
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
            }

            // 8. Xử lý hậu kỳ & Mythic Engine
            if (!ac.signal.aborted) {
                // Post-process logic (Variables, Regex, HTML)
                await processAIResponse(accumulatedText, aiMsg.id);
                logger.logResponse(accumulatedText);

                // --- VÒNG LẶP 2: MYTHIC ENGINE (RPG SYSTEM) ---
                if (state.card.rpg_data) {
                    logger.logSystemMessage('state', 'system', 'Mythic Engine: Đang kích hoạt Medusa...');
                    const apiKey = getApiKey();
                    
                    if (apiKey) {
                        let retryMedusa = true;
                        
                        while (retryMedusa) {
                            try {
                                const mythicStartTime = Date.now();
                                
                                // History for RPG: User Input + AI Output (or Story Chunk)
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
                                    throw new Error('error' in medusaResult ? medusaResult.error : "Unknown RPG Error");
                                }

                            } catch (e: any) {
                                logger.logSystemMessage('error', 'system', `Mythic Engine Error: ${e.message}`);
                                
                                const decision = await waitForUserDecision(
                                    "Lỗi Mythic Engine (RPG)",
                                    "Hệ thống RPG không thể cập nhật trạng thái thế giới (Có thể do lỗi mạng hoặc AI không trả về dữ liệu). Bạn muốn thử lại hay bỏ qua (giữ nguyên trạng thái cũ)?",
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

            } else if (!options?.forcedContent && state.preset.stream_response) {
                // If aborted during stream, ensure partial content is saved
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
    }, [state, lorebooks, createPlaceholderMessage, processAIResponse, logger, scanInput, showToast, waitForUserDecision]); 

    return { 
        sendMessage, 
        stopGeneration,
        interactiveError,
        handleUserDecision,
        manualMythicTrigger,
        processAIResponse // Export this so Engine can use it for specific needs
    };
};

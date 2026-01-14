
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

// Default Sounds (Base64) - Short & Lightweight
// AI Done: "Pop/Beep"
const DEFAULT_AI_SOUND = "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWgAAAA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABMMTameqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"; 
// Note: The above is silent for safety. 
// Real default will be handled by browser if we passed empty, but let's use a real short beep for user experience.
// Actually, for cleaner code, let's use a very short beep base64.
const REAL_AI_SOUND = "data:audio/wav;base64,UklGRl9vT1dAVEZNVfmtTCSEAAAzABkADgAAAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // Placeholder short blip

// RPG Done: "Chime"
const REAL_RPG_SOUND = "data:audio/wav;base64,UklGRl9vT1dAVEZNVfmtTCSEAAAzABkADgAAAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // Placeholder

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

    // --- SOUND NOTIFICATION SYSTEM ---
    const playNotification = useCallback((type: 'ai' | 'rpg') => {
        const { visualState } = state;
        
        // Check enabled state (Default is true if undefined)
        if (visualState.systemSoundEnabled === false) return;

        // Determine source
        // Note: For real production use, we would use real MP3 files hosted or larger Base64.
        // Here we try to use the user provided URL first, then fallback.
        // Since I cannot embed 50KB base64 strings here easily without clutter, 
        // I will rely on the user providing URLs OR use a simple AudioContext oscillator beep if no URL is provided to keep it self-contained?
        // No, let's stick to the URL logic. If no URL, we might skip or use a tiny reliable beep.
        
        let soundUrl = '';
        if (type === 'ai') soundUrl = visualState.aiSoundUrl || '';
        if (type === 'rpg') soundUrl = visualState.rpgSoundUrl || '';

        if (soundUrl) {
            const audio = new Audio(soundUrl);
            audio.volume = 0.5;
            audio.play().catch(e => console.warn('Sound play error:', e));
        } else {
            // Fallback: Use AudioContext to generate a beep if no URL (Cleaner than embedding Base64)
            try {
                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContext) return;
                
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                if (type === 'ai') {
                    // Soft Pop
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(800, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.1, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.1);
                } else {
                    // Magic Chime (High Sine)
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(1200, ctx.currentTime);
                    osc.frequency.linearRampToValueAtTime(1800, ctx.currentTime + 0.3);
                    gain.gain.setValueAtTime(0.05, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.5);
                }
            } catch(e) {
                console.error("Audio Context Error", e);
            }
        }
    }, [state.visualState]);

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

            // Get Max Tokens from Preset
            const maxTokens = Number(state.preset?.max_tokens) || 16384;

            const medusaResult = await MedusaService.processTurn(
                historyLog,
                state.card.rpg_data,
                apiKey,
                activeEntries,
                allEntries,
                'gemini-flash-lite-latest',
                maxTokens
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
                    playNotification('rpg'); // PLAY SOUND
                } else {
                    state.setRpgNotification(null); // Clear if no new notifications
                }
                // ----------------------------------------

                // --- LIVE LINK SYNC ---
                const generatedEntries = syncDatabaseToLorebook(medusaResult.newDb);
                state.setGeneratedLorebookEntries(generatedEntries);
                if (generatedEntries.length > 0) {
                    const names = generatedEntries.map(e => e.keys[0]).join(', ');
                    logger.logSystemMessage('state', 'system', `[Live-Link] Đồng bộ ${generatedEntries.length} mục: ${names}`);
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

    }, [state, lorebooks, logger, showToast, playNotification]);

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
                    
                    const textToScan = options?.forcedContent 
                        ? `${recentHistoryText}\n${text}\n${options.forcedContent}`
                        : `${recentHistoryText}\n${text}`;
                        
                    const historyList = state.messages.map(m => m.content).slice(-3);

                    const isStoryModeChunk = !!options?.forcedContent;
                    const shouldUseKeywordMode = isStoryModeChunk || forceKeywordMode;

                    const effectivePreset = shouldUseKeywordMode 
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
                        retryScan = true; 
                        logger.logSystemMessage('warn', 'system', 'Người dùng chọn: Bỏ qua lỗi, chuyển sang quét từ khóa.');
                    }
                }
            }
            
            if (!scanResult) {
                 scanResult = { activeEntries: [], updatedRuntimeState: state.worldInfoRuntime };
            }

            state.setSessionData({ worldInfoRuntime: scanResult.updatedRuntimeState });
            logger.logWorldInfo(scanResult.activeEntries);
            if (scanResult.smartScanLog) {
                logger.logSmartScan(scanResult.smartScanLog.fullPrompt, scanResult.smartScanLog.rawResponse, scanResult.smartScanLog.latency);
            }
            
            // 5. Chuẩn bị Prompt
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

            // 6. Tạo tin nhắn AI (Placeholder)
            const aiMsg = createPlaceholderMessage('model');
            aiMsg.rpgState = currentRpgSnapshot;
            aiMsg.worldInfoRuntime = scanResult.updatedRuntimeState; 
            
            state.addMessage(aiMsg);

            // 7. Thực hiện lấy nội dung
            let accumulatedText = "";
            
            if (options?.forcedContent) {
                accumulatedText = options.forcedContent;
                state.updateMessage(aiMsg.id, { content: accumulatedText });
                playNotification('ai'); // PLAY SOUND (Immediate for Story)
            } else {
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
                
                // PLAY AI SOUND NOTIFICATION (Only if not already played above)
                if (!options?.forcedContent) {
                    playNotification('ai');
                }

                // --- VÒNG LẶP 2: MYTHIC ENGINE (RPG SYSTEM) ---
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
                                const maxTokens = Number(state.preset?.max_tokens) || 16384;

                                const medusaResult = await MedusaService.processTurn(
                                    historyLog,
                                    state.card.rpg_data,
                                    apiKey,
                                    dynamicActiveEntries,
                                    allEntries,
                                    'gemini-flash-lite-latest',
                                    maxTokens
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
                                        playNotification('rpg'); // PLAY RPG SOUND
                                    } else {
                                        state.setRpgNotification(null);
                                    }
                                    
                                    const generatedEntries = syncDatabaseToLorebook(medusaResult.newDb);
                                    state.setGeneratedLorebookEntries(generatedEntries);
                                    if (generatedEntries.length > 0) {
                                        const names = generatedEntries.map(e => e.keys[0]).join(', ');
                                        logger.logSystemMessage('state', 'system', `[Live-Link] Đồng bộ ${generatedEntries.length} mục: ${names}`);
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
    }, [state, lorebooks, createPlaceholderMessage, processAIResponse, logger, scanInput, showToast, waitForUserDecision, playNotification]); 

    return { 
        sendMessage, 
        stopGeneration,
        interactiveError,
        handleUserDecision,
        manualMythicTrigger,
        processAIResponse // Export this so Engine can use it for specific needs
    };
};

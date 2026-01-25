
import { useCallback, useState, useRef } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useResponseHandler } from './useResponseHandler';
import { constructChatPrompt, prepareChat } from '../../services/promptManager';
import { sendChatRequestStream, sendChatRequest } from '../../services/geminiService';
import { useLorebook } from '../../contexts/LorebookContext';
import { useChatLogger } from '../useChatLogger';
import { useWorldSystem } from '../useWorldSystem';
import { MedusaService, syncDatabaseToLorebook, parseCustomActions, applyMedusaActions } from '../../services/medusaService'; 
import { getApiKey, getConnectionSettings, getProxyForTools } from '../../services/settingsService';
import { useToast } from '../../components/ToastSystem';
import type { WorldInfoEntry, InteractiveErrorState } from '../../types';
import { countTotalTurns } from '../useChatMemory';

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
    
    const errorResolverRef = useRef<((decision: 'retry' | 'ignore') => void) | null>(null);

    // --- SOUND NOTIFICATION SYSTEM ---
    const playNotification = useCallback((type: 'ai' | 'rpg') => {
        const { visualState } = useChatStore.getState();
        if (visualState.systemSoundEnabled === false) return;

        let soundUrl = '';
        if (type === 'ai') soundUrl = visualState.aiSoundUrl || '';
        if (type === 'rpg') soundUrl = visualState.rpgSoundUrl || '';

        if (soundUrl) {
            const audio = new Audio(soundUrl);
            audio.volume = 0.5;
            audio.play().catch(e => console.warn('Sound play error:', e));
        } else {
            try {
                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                if (type === 'ai') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(800, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.1, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.1);
                } else {
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(1200, ctx.currentTime);
                    osc.frequency.linearRampToValueAtTime(1800, ctx.currentTime + 0.3);
                    gain.gain.setValueAtTime(0.05, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.5);
                }
            } catch(e) {}
        }
    }, []);

    const waitForUserDecision = useCallback((title: string, message: string, errorDetails: any, canIgnore: boolean = true): Promise<'retry' | 'ignore'> => {
        return new Promise((resolve) => {
            const errorStr = errorDetails instanceof Error ? errorDetails.message : String(errorDetails);
            setInteractiveError({ hasError: true, title, message, errorDetails: errorStr, canIgnore });
            errorResolverRef.current = resolve;
        });
    }, []);

    const handleUserDecision = useCallback((decision: 'retry' | 'ignore') => {
        setInteractiveError(prev => ({ ...prev, hasError: false }));
        if (errorResolverRef.current) {
            errorResolverRef.current(decision);
            errorResolverRef.current = null;
        }
    }, []);

    const stopGeneration = useCallback(() => {
        const freshState = useChatStore.getState();
        if (freshState.abortController) {
            freshState.abortController.abort();
            state.setAbortController(null);
            state.setLoading(false);
            logger.logSystemMessage('interaction', 'system', 'Người dùng đã dừng quá trình tạo.');
        }
    }, [state, logger]);

    // --- MANUAL MYTHIC TRIGGER ---
    const manualMythicTrigger = useCallback(async () => {
        const freshState = useChatStore.getState();

        if (!freshState.card || !freshState.card.rpg_data) {
            showToast('Không tìm thấy dữ liệu RPG để xử lý.', 'warning');
            return;
        }

        const msgs = freshState.messages;
        if (msgs.length < 2) {
            showToast('Lịch sử trò chuyện chưa đủ để phân tích.', 'warning');
            return;
        }

        const currentTurn = countTotalTurns(msgs);

        let lastModelMsg = null;
        let lastUserMsg = null;

        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'model') {
                lastModelMsg = msgs[i];
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
        const connection = getConnectionSettings();
        const useProxy = connection.source === 'proxy' || getProxyForTools();

        // Nếu không dùng Proxy, bắt buộc phải có API Key. Nếu dùng Proxy chuẩn OpenAI thì không cần.
        // Tuy nhiên, nếu là Google Native Proxy, SDK vẫn cần một chuỗi key bất kỳ để khởi tạo.
        if (!useProxy && !apiKey) {
            showToast('Chưa cấu hình API Key.', 'error');
            return;
        }

        logger.logSystemMessage('interaction', 'system', 'Đang buộc chạy lại Mythic Engine...');
        state.setLoading(true);

        try {
            const mythicStartTime = Date.now();
            let historyLog = `User: ${lastUserMsg.content}\nGM/System: ${lastModelMsg.content}`;
            
            let allEntries: WorldInfoEntry[] = freshState.card.char_book?.entries || [];
            lorebooks.forEach(lb => {
                if (lb.book?.entries) allEntries = [...allEntries, ...lb.book.entries];
            });

            const activeEntries: WorldInfoEntry[] = []; 
            const maxTokens = Number(freshState.preset?.max_tokens) || 16384;

            const medusaResult = await MedusaService.processTurn(
                historyLog,
                freshState.card.rpg_data,
                apiKey || "PROXY_ENABLED",
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
                const updatedCard = { ...freshState.card, rpg_data: medusaResult.newDb };
                state.setSessionData({ card: updatedCard });
                state.updateMessage(lastModelMsg.id, { rpgState: medusaResult.newDb });

                if (medusaResult.logs && medusaResult.logs.length > 0) {
                    logger.logSystemMessage('script-success', 'system', `[RPG Re-run]:\n${medusaResult.logs.join('\n')}`);
                }
                
                if (medusaResult.notifications && medusaResult.notifications.length > 0) {
                    state.setRpgNotification(medusaResult.notifications.join('\n'));
                    playNotification('rpg');
                }

                const generatedEntries = syncDatabaseToLorebook(medusaResult.newDb);
                state.setGeneratedLorebookEntries(generatedEntries);
                
                showToast('Đã cập nhật trạng thái RPG thành công.', 'success');
            } else {
                throw new Error('error' in medusaResult ? medusaResult.error : "Unknown RPG Error");
            }

        } catch (e: any) {
            logger.logSystemMessage('error', 'system', `Mythic Engine Error: ${e.message}`);
            showToast(`Lỗi RPG: ${e.message}`, 'error');
        } finally {
            state.setLoading(false);
        }
    }, [state, lorebooks, logger, showToast, playNotification]);

    const sendMessage = useCallback(async (text: string, options?: { forcedContent?: string }) => {
        const freshState = useChatStore.getState();
        if (!freshState.card || !freshState.preset || !text.trim()) return;

        state.setError(null);
        state.setLoading(true);
        logger.startTurn();

        const ac = new AbortController();
        state.setAbortController(ac);

        const currentTurn = countTotalTurns(freshState.messages) + 1;
        
        const userMsg = { 
            id: `u-${Date.now()}`, 
            role: 'user' as const, 
            content: text, 
            timestamp: Date.now(),
            contextState: JSON.parse(JSON.stringify(freshState.variables)),
            rpgState: freshState.card.rpg_data ? JSON.parse(JSON.stringify(freshState.card.rpg_data)) : undefined,
            worldInfoRuntime: JSON.parse(JSON.stringify(freshState.worldInfoRuntime)),
            worldInfoState: JSON.parse(JSON.stringify(freshState.worldInfoState))
        };
        state.addMessage(userMsg);

        try {
            let scanResult;
            let retryScan = true;
            let forceKeywordMode = false;

            while (retryScan) {
                try {
                    const messagesForScan = [...freshState.messages]; 
                    const recentHistoryText = messagesForScan.slice(-3).map(m => m.content).join('\n');
                    const textToScan = options?.forcedContent 
                        ? `${recentHistoryText}\n${text}\n${options.forcedContent}`
                        : `${recentHistoryText}\n${text}`;
                        
                    scanResult = await scanInput(
                        textToScan, 
                        freshState.worldInfoState, 
                        freshState.worldInfoRuntime, 
                        freshState.worldInfoPinned,
                        forceKeywordMode ? { ...freshState.preset, smart_scan_mode: 'keyword' } : freshState.preset,
                        messagesForScan.map(m => m.content).slice(-3), 
                        text, 
                        freshState.variables,
                        freshState.generatedLorebookEntries,
                        currentTurn
                    );
                    retryScan = false;
                } catch (e: any) {
                    const decision = await waitForUserDecision("Lỗi Quét Thông Minh", "AI gặp sự cố khi phân tích ngữ cảnh.", e);
                    if (decision === 'retry') retryScan = true;
                    else { forceKeywordMode = true; retryScan = true; }
                }
            }

            if (scanResult) {
                state.setSessionData({ worldInfoRuntime: scanResult.updatedRuntimeState });
                logger.logWorldInfo(scanResult.activeEntries);
                if (scanResult.smartScanLog) {
                    logger.logSmartScan(scanResult.smartScanLog.fullPrompt, scanResult.smartScanLog.rawResponse, scanResult.smartScanLog.latency);
                }
            }

            let accumulatedText = "";
            const aiMsg = createPlaceholderMessage('model');
            state.addMessage(aiMsg);

            if (options?.forcedContent) {
                accumulatedText = options.forcedContent;
                state.updateMessage(aiMsg.id, { content: accumulatedText });
            } else {
                const sessionLorebook = { name: "Generated", book: { entries: freshState.generatedLorebookEntries } };
                const { baseSections } = prepareChat(freshState.card, freshState.preset, [...lorebooks, sessionLorebook], freshState.persona);
                const constructed = await constructChatPrompt(
                    baseSections, [...freshState.messages, userMsg], freshState.authorNote,
                    freshState.card, freshState.longTermSummaries, freshState.preset.summarization_chunk_size || 10,
                    freshState.variables, freshState.lastStateBlock, [...lorebooks, sessionLorebook],
                    freshState.preset.context_mode || 'standard', freshState.persona?.name || 'User',
                    freshState.worldInfoState, scanResult?.activeEntries, freshState.worldInfoPlacement, freshState.preset
                );

                if (freshState.preset.stream_response) {
                    const stream = sendChatRequestStream(constructed.fullPrompt, freshState.preset, ac.signal);
                    for await (const chunk of stream) {
                        if (ac.signal.aborted) break;
                        accumulatedText += chunk;
                        state.updateMessage(aiMsg.id, { content: accumulatedText + " ▌" });
                    }
                } else {
                    const result = await sendChatRequest(constructed.fullPrompt, freshState.preset);
                    if (!ac.signal.aborted) accumulatedText = result.response.text || "";
                }
            }

            if (!ac.signal.aborted) {
                await processAIResponse(accumulatedText, aiMsg.id);
                logger.logResponse(accumulatedText);
                playNotification('ai');

                // Auto Trigger RPG Logic (Standalone Mode)
                if (freshState.card.rpg_data && freshState.card.rpg_data.settings?.executionMode !== 'integrated' && freshState.card.rpg_data.settings?.triggerMode === 'auto') {
                    setTimeout(() => manualMythicTrigger(), 500);
                }
            }

        } catch (e: any) {
            state.setError(e.message);
        } finally {
            state.setLoading(false);
            state.setAbortController(null);
        }
    }, [state, lorebooks, logger, scanInput, createPlaceholderMessage, processAIResponse, playNotification, manualMythicTrigger, waitForUserDecision]);

    return { sendMessage, stopGeneration, interactiveError, handleUserDecision, manualMythicTrigger, processAIResponse };
};

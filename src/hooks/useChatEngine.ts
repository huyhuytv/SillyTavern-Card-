
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatMessage, QuickReply, VisualState, PromptSection, ScriptButton } from '../types'; // Import ScriptButton
import { prepareChat, constructChatPrompt, cleanMessageContent } from '../services/promptManager';
import { useChatLogger } from './useChatLogger';
import { useChatMemory } from './useChatMemory';
import { useLorebook } from '../contexts/LorebookContext';
import { executeScript, ScriptContext } from '../services/stScriptEngine';
import { useToast } from '../components/ToastSystem';
import { usePopup } from '../components/PopupSystem';
import { useChatSession } from './useChatSession';
import { useAICompletion } from './useAICompletion';
import { useWorldSystem } from './useWorldSystem';
import { processWithRegex } from '../services/regexService';
import { useTTS } from '../contexts/TTSContext'; 
import { parseLooseJson } from '../utils'; // IMPORTED parseLooseJson

export const useChatEngine = (sessionId: string | null) => {
    // --- 1. State & Data Layer (Managed by useChatSession) ---
    const {
        messages, setMessages,
        variables, setVariables,
        extensionSettings, setExtensionSettings,
        worldInfoState, setWorldInfoState,
        worldInfoPinned, setWorldInfoPinned,
        worldInfoPlacement, setWorldInfoPlacement,
        worldInfoRuntime, setWorldInfoRuntime,
        visualState, setVisualState,
        authorNote, setAuthorNote,
        lastStateBlock, setLastStateBlock,
        longTermSummaries, setLongTermSummaries,
        summaryQueue, setSummaryQueue, // NEW: Queue State
        initialDiagnosticLog,
        card,
        preset,
        persona,
        mergedSettings,
        isLoading: isSessionLoading,
        error: sessionError,
        saveSession,
        changePreset
    } = useChatSession(sessionId);

    // --- 2. AI & Engine State ---
    const { generate, generateStream, isGenerating, error: aiError, clearError: clearAiError } = useAICompletion();
    const { scanInput, processOutput, isScanning } = useWorldSystem(card);
    
    // Local transient state
    const [baseSections, setBaseSections] = useState<PromptSection[]>([]); // Store structured sections
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
    const [scriptButtons, setScriptButtons] = useState<ScriptButton[]>([]); // NEW: Dynamic Script Buttons
    const [isInputLocked, setIsInputLocked] = useState(false); // NEW: UI Lock State
    const [isAutoLooping, setIsAutoLooping] = useState(false); // NEW: Auto Loop State
    
    const messageIdCounter = useRef(0);
    
    // --- 3. Services & Hooks ---
    const { logs, startTurn, logPrompt, logResponse, logSummary, logDiagnostic, logWorldInfo, logSmartScan, logSystemMessage, clearLogs, clearSystemLogs } = useChatLogger();
    
    // NEW: Pass explicit state setters to Memory Hook
    const { 
        isGlobalSummarizing,
        queueLength,
        checkAndFillQueue,
        processQueueStep,
        resetMemory,
        regenerateSpecificSummary, // NEW
        retryFailedTask // NEW
    } = useChatMemory(
        card?.name || 'Character',
        longTermSummaries,
        setLongTermSummaries,
        summaryQueue,
        setSummaryQueue,
        saveSession
    );

    const { lorebooks } = useLorebook();
    const { showToast } = useToast();
    const { showPopup } = usePopup();
    
    // TTS INTEGRATION
    const { autoPlayEnabled, addToQueue, stopAll } = useTTS();
    
    const isLoading = isSessionLoading || isGenerating || isScanning;
    const error = sessionError || aiError;

    // Sync Memory Hook with Session Data when loaded
    useEffect(() => {
        if (messages.length > 0) {
             messageIdCounter.current = messages.length;
        }
    }, [messages.length]);
    
    // Hydrate logs with initial diagnostic info if present
    useEffect(() => {
        if (initialDiagnosticLog && logs.systemLog.length === 0) {
             logDiagnostic(initialDiagnosticLog, 'system');
        }
    }, [initialDiagnosticLog, logDiagnostic]); 
    
    // --- 4. Initialization Logic (Prompt Building) ---
    useEffect(() => {
        if (card && mergedSettings) {
             // Prepare base sections (templates)
             const { baseSections: builtSections } = prepareChat(card, mergedSettings, lorebooks, persona, worldInfoState, undefined, worldInfoPlacement);
             setBaseSections(builtSections);
        }
    }, [card, mergedSettings, lorebooks, persona, worldInfoState, worldInfoPlacement, isSessionLoading]);

    // --- 5. AUTOMATIC MEMORY PROCESSING LOOP ---
    useEffect(() => {
        if (!mergedSettings) return;
        
        const runMemoryLogic = async () => {
            // 1. Check if we need to add tasks to queue
            const contextDepth = mergedSettings.context_depth || 20; 
            const chunkSize = mergedSettings.summarization_chunk_size || 10;
            
            await checkAndFillQueue(messages, contextDepth, chunkSize);

            // 2. If queue has items, process ONE step
            if (queueLength > 0) {
                // IMPORTANT: Check if the first item is failed. If so, stop.
                if (summaryQueue[0]?.status === 'failed') return;

                const summarizationPrompt = mergedSettings.summarization_prompt;
                await processQueueStep(messages, summarizationPrompt, chunkSize);
            }
        };

        // Run logic only if not already busy generating responses
        // and data is ready
        if (!isSessionLoading && !isGenerating && messages.length > 0) {
            runMemoryLogic();
        }
    }, [messages, queueLength, summaryQueue, mergedSettings, isSessionLoading, isGenerating, checkAndFillQueue, processQueueStep]);

    // --- 5b. MANUAL MEMORY TRIGGER ---
    const triggerSmartContext = useCallback(async () => {
        if (!mergedSettings) return;
        const contextDepth = mergedSettings.context_depth || 20; 
        const chunkSize = mergedSettings.summarization_chunk_size || 10;
        
        // Force check regardless of auto loop state, but respecting logic inside useChatMemory
        await checkAndFillQueue(messages, contextDepth, chunkSize);
        
        // If items were added, the Effect above will pick it up and start processing.
        // If not added (because threshold not met), nothing happens, which is correct for Option A.
    }, [mergedSettings, messages, checkAndFillQueue]);

    // --- 5c. REGENERATE SUMMARY WRAPPER ---
    const handleRegenerateSummary = useCallback(async (index: number) => {
        if (!mergedSettings) return;
        const chunkSize = mergedSettings.summarization_chunk_size || 10;
        const prompt = mergedSettings.summarization_prompt;
        
        await regenerateSpecificSummary(index, messages, prompt, chunkSize);
    }, [mergedSettings, messages, regenerateSpecificSummary]);

    // --- 5d. RETRY FAILED TASK WRAPPER ---
    const handleRetryFailedTask = useCallback(async () => {
        if (!mergedSettings) return;
        const chunkSize = mergedSettings.summarization_chunk_size || 10;
        const prompt = mergedSettings.summarization_prompt;
        
        await retryFailedTask(messages, prompt, chunkSize);
    }, [mergedSettings, messages, retryFailedTask]);


    const createMessage = (
        role: 'user' | 'model' | 'system', 
        content: string, 
        interactiveHtml?: string, 
        originalRawContent?: string,
        contextState?: Record<string, any>
    ): ChatMessage => {
        messageIdCounter.current += 1;
        const stateSnapshot = contextState ? JSON.parse(JSON.stringify(contextState)) : undefined;
        return { 
            id: `msg-${Date.now()}-${messageIdCounter.current}`, 
            role, 
            content, 
            interactiveHtml, 
            originalRawContent,
            contextState: stateSnapshot
        };
    };

    const processAndSetModelResponse = useCallback(async (
        rawContent: string, 
        currentMessages: ChatMessage[],
        overrideVariables?: Record<string, any>
    ) => {
        if (!card || !preset || !mergedSettings) return;
        logResponse(rawContent);

        const variablesToUse = overrideVariables || variables;

        const { 
            updatedVariables, 
            displayContent, 
            interactiveHtml: newInteractiveHtml, 
            diagnosticLog, 
            variableLog, 
            originalRawContent
        } = processOutput(rawContent, variablesToUse);

        logDiagnostic(variableLog, 'variable');
        logDiagnostic(diagnosticLog, 'regex');

        const choices: QuickReply[] = [];
        const cleanDisplayContent = displayContent.replace(/\[CHOICE:\s*"([^"]+)"\]/gi, (match, text) => {
            choices.push({ label: text, message: text });
            return '';
        }).trim();

        if (choices.length > 0) {
            setQuickReplies(choices);
        }

        const modelMessages: ChatMessage[] = [];

        // --- FORCE IFRAME LOGIC ---
        // Check if card has enabled scripts
        const hasEnabledScripts = card.extensions?.TavernHelper_scripts?.some(
            s => s.type === 'script' && s.value.enabled
        );

        let finalInteractiveHtml = newInteractiveHtml;
        let finalOriginalRaw = newInteractiveHtml ? originalRawContent : undefined;
        let messageDisplayContent = cleanDisplayContent;
        let isFallbackInteractive = false;

        // If scripts exist but regex found no HTML, we force the message to be interactive.
        // We put the text content inside the HTML so it displays, while the scripts run in background.
        if (hasEnabledScripts && !finalInteractiveHtml) {
            console.log('[ChatEngine] Scripts detected. Forcing Interactive Message.');
            finalInteractiveHtml = cleanDisplayContent || '<div></div>'; 
            finalOriginalRaw = originalRawContent;
            messageDisplayContent = ''; // Clear display content to avoid double render
            isFallbackInteractive = true; // MARK AS FALLBACK
        }

        if (messageDisplayContent.trim()) {
            modelMessages.push(createMessage('model', messageDisplayContent, undefined, originalRawContent, updatedVariables));
        }

        let nextStateBlock = lastStateBlock;

        if (finalInteractiveHtml) {
            modelMessages.push(createMessage('model', '', finalInteractiveHtml, finalOriginalRaw, updatedVariables));
            
            if (!isFallbackInteractive) {
                nextStateBlock = finalInteractiveHtml;
            }
        }
        
        if (modelMessages.length === 0) {
             modelMessages.push(createMessage('model', '(Không có nội dung hiển thị)', undefined, undefined, updatedVariables));
        }
        
        const finalNewMessages = [...currentMessages, ...modelMessages];
        
        // --- TTS AUTO-PLAY TRIGGER (Non-Streaming Fallback) ---
        if (autoPlayEnabled && mergedSettings.tts_enabled && !mergedSettings.tts_streaming) {
            modelMessages.forEach(msg => {
                const textToRead = msg.content || (msg.originalRawContent ? cleanMessageContent(msg.originalRawContent) : '');
                if (textToRead.trim()) {
                    const voice = mergedSettings.tts_provider === 'native' 
                        ? (mergedSettings.tts_native_voice || '') 
                        : (mergedSettings.tts_voice || 'Kore');
                    
                    const cleanText = textToRead.replace(/<[^>]*>/g, '');
                    if (cleanText.trim()) {
                        addToQueue(cleanText, voice, msg.id, {
                            provider: mergedSettings.tts_provider || 'gemini',
                            rate: mergedSettings.tts_rate,
                            pitch: mergedSettings.tts_pitch
                        });
                    }
                }
            });
        }
        
        setVariables(updatedVariables);
        setMessages(finalNewMessages);
        setLastStateBlock(nextStateBlock);

        // Save immediately
        await saveSession({
            messages: finalNewMessages,
            variables: updatedVariables,
            lastStateBlock: nextStateBlock,
            longTermSummaries: longTermSummaries, // State is managed by hook now, but we save current ref
            summaryQueue: summaryQueue
        });

    }, [card, preset, mergedSettings, logResponse, logDiagnostic, logSummary, saveSession, longTermSummaries, summaryQueue, variables, lastStateBlock, setVariables, setMessages, setLongTermSummaries, setLastStateBlock, processOutput, autoPlayEnabled, addToQueue]);


    const sendMessage = useCallback(async (messageContent: string) => {
        // Block sending if summarizing
        if (!messageContent.trim() || !baseSections || isGenerating || isScanning || isGlobalSummarizing || !card || !preset || !mergedSettings) return;

        startTurn(); 

        const regexScripts = card.extensions?.regex_scripts || [];
        const { displayContent: processedInput, diagnosticLog: inputRegexLog } = processWithRegex(messageContent, regexScripts, [1]);
        
        if (inputRegexLog && inputRegexLog.length > 50) { 
            logDiagnostic(inputRegexLog, 'regex');
        }

        const userMessage = createMessage('user', processedInput, undefined, undefined, variables);
        const currentMessages = [...messages, userMessage];
        setMessages(currentMessages);
        clearAiError();

        const cleanInput = cleanMessageContent(processedInput);
        const textToScan = cleanInput + '\n' + currentMessages.slice(-3).map(m => cleanMessageContent(m.content)).join('\n');
        const historyForScan = currentMessages.slice(-10).map(m => `${m.role}: ${cleanMessageContent(m.content)}`);

        const { activeEntries, updatedRuntimeState, smartScanLog } = await scanInput(
            textToScan,
            worldInfoState,
            worldInfoRuntime,
            worldInfoPinned,
            mergedSettings,
            historyForScan,
            cleanInput,
            variables
        );
        
        if (smartScanLog) {
            logSmartScan(smartScanLog.fullPrompt, smartScanLog.rawResponse, smartScanLog.latency);
        }

        setWorldInfoRuntime(updatedRuntimeState);
        logWorldInfo(activeEntries); 

        try {
            const promptMessages = currentMessages.filter(m => m.role !== 'system');
            
            const { baseSections: dynamicSections } = prepareChat(
                card, 
                mergedSettings, 
                lorebooks, 
                persona, 
                undefined, 
                activeEntries,
                worldInfoPlacement
            );
            
            const chunkSize = mergedSettings.summarization_chunk_size || 10; 
            const contextMode = mergedSettings.context_mode || 'standard';

            const { fullPrompt, structuredPrompt } = await constructChatPrompt(
                dynamicSections, 
                promptMessages,
                authorNote,
                card,
                longTermSummaries,
                chunkSize, 
                variables,
                lastStateBlock,
                lorebooks, 
                contextMode,
                persona?.name || 'User',
                worldInfoState,
                activeEntries,
                worldInfoPlacement,
                mergedSettings
            );
            
            logPrompt(structuredPrompt); 
            
            await saveSession({
                messages: currentMessages,
                worldInfoRuntime: updatedRuntimeState
            });
            
            if (mergedSettings.stream_response) {
                const streamMessage = createMessage('model', '...', undefined, undefined, variables);
                setMessages(prev => [...prev, streamMessage]);
                
                let rawAccumulatedText = '';
                let ttsBuffer = "";
                const isTtsStreamingActive = autoPlayEnabled && mergedSettings.tts_enabled && mergedSettings.tts_streaming;
                
                const stream = generateStream(fullPrompt, mergedSettings);
                for await (const chunk of stream) {
                    rawAccumulatedText += chunk;
                    
                    if (isTtsStreamingActive) {
                        ttsBuffer += chunk;
                        let hasThinking = true;
                        while(hasThinking) {
                            const newBuff = ttsBuffer.replace(/<thinking>[\s\S]*?<\/thinking>/i, "");
                            if (newBuff === ttsBuffer) hasThinking = false;
                            else ttsBuffer = newBuff;
                        }
                        const isInsideThinking = /<thinking/i.test(ttsBuffer) && !/<\/thinking/i.test(ttsBuffer);

                        if (!isInsideThinking) {
                            const match = ttsBuffer.match(/[.!?\n]+(?=\s|$)/);
                            if (match && match.index !== undefined) {
                                const cutIndex = match.index + match[0].length;
                                const sentence = ttsBuffer.slice(0, cutIndex);
                                ttsBuffer = ttsBuffer.slice(cutIndex);
                                const cleanSentence = cleanMessageContent(sentence).replace(/<[^>]*>/g, '').trim();
                                
                                if (cleanSentence) {
                                    const voice = mergedSettings.tts_provider === 'native' 
                                        ? (mergedSettings.tts_native_voice || '') 
                                        : (mergedSettings.tts_voice || 'Kore');
                                    
                                    addToQueue(cleanSentence, voice, `stream_${Date.now()}`, {
                                        provider: mergedSettings.tts_provider || 'gemini',
                                        rate: mergedSettings.tts_rate,
                                        pitch: mergedSettings.tts_pitch
                                    });
                                }
                            }
                        }
                    }
                    
                    const display = cleanMessageContent(rawAccumulatedText);
                    
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const idx = newMsgs.findIndex(m => m.id === streamMessage.id);
                        if (idx !== -1) {
                            newMsgs[idx] = { ...newMsgs[idx], content: display };
                        }
                        return newMsgs;
                    });
                }
                
                if (isTtsStreamingActive && ttsBuffer.trim()) {
                     if (!/<thinking/i.test(ttsBuffer)) {
                         const cleanSentence = cleanMessageContent(ttsBuffer).replace(/<[^>]*>/g, '').trim();
                         if (cleanSentence) {
                             const voice = mergedSettings.tts_provider === 'native' ? (mergedSettings.tts_native_voice || '') : (mergedSettings.tts_voice || 'Kore');
                             addToQueue(cleanSentence, voice, `stream_end_${Date.now()}`, {
                                provider: mergedSettings.tts_provider || 'gemini',
                                rate: mergedSettings.tts_rate,
                                pitch: mergedSettings.tts_pitch
                             });
                         }
                     }
                }
                
                setMessages(prev => prev.filter(m => m.id !== streamMessage.id)); 
                await processAndSetModelResponse(rawAccumulatedText, currentMessages, variables); 

            } else {
                const response = await generate(fullPrompt, mergedSettings);
                if (response) {
                    const rawContent = response.text || '[Lỗi: AI đã trả về một phản hồi trống]';
                    await processAndSetModelResponse(rawContent, currentMessages, variables);
                } else {
                     setMessages(prev => prev.filter(m => m.id !== userMessage.id));
                }
            }

        } catch (e) {
            console.error("SendMessage Error:", e);
            stopAll();
            setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        }
    }, [baseSections, messages, authorNote, card, preset, mergedSettings, longTermSummaries, isGenerating, isScanning, isGlobalSummarizing, logPrompt, processAndSetModelResponse, variables, lastStateBlock, worldInfoState, worldInfoRuntime, worldInfoPinned, worldInfoPlacement, lorebooks, persona, saveSession, logWorldInfo, logSmartScan, setMessages, setWorldInfoRuntime, generate, generateStream, clearAiError, scanInput, startTurn, logDiagnostic, autoPlayEnabled, addToQueue, stopAll]);
    
    // --- AUTO LOOP LOGIC ---
    useEffect(() => {
        if (!isAutoLooping || isGenerating || isScanning || isGlobalSummarizing || messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];

        if (lastMessage.role === 'model') {
            const rawContent = lastMessage.originalRawContent || lastMessage.content || "";
            
            const choiceRegex = /\[CHOICE:\s*"([^"]+)"\]/gi;
            const choices: string[] = [];
            let match;
            while ((match = choiceRegex.exec(rawContent)) !== null) {
                choices.push(match[1]);
            }

            let nextPrompt = "";

            if (choices.length > 0) {
                const randomIndex = Math.floor(Math.random() * choices.length);
                nextPrompt = choices[randomIndex];
            } else {
                nextPrompt = preset?.continue_nudge_prompt || "[Tiếp tục...]";
            }

            setTimeout(() => {
                sendMessage(nextPrompt);
            }, 0);
        }
    }, [isAutoLooping, isGenerating, isScanning, isGlobalSummarizing, messages, sendMessage, preset]);

    const addSystemMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;
        startTurn();
        const systemMsg = createMessage('system', content, undefined, undefined, variables);
        const newMessages = [...messages, systemMsg];
        setMessages(newMessages);
        await saveSession({ messages: newMessages });
    }, [messages, saveSession, setMessages, variables, startTurn]);

    // --- REWIND / DELETE MESSAGE LOGIC ---
    const deleteMessage = useCallback(async (messageId: string) => {
        if (isGenerating || isScanning) return;

        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) return;

        const newMessages = messages.slice(0, messageIndex);
        
        const lastRemainingMessage = newMessages.length > 0 ? newMessages[newMessages.length - 1] : null;
        let restoredVariables = {}; 
        let restoredStateBlock = '';

        if (lastRemainingMessage && lastRemainingMessage.contextState) {
            restoredVariables = JSON.parse(JSON.stringify(lastRemainingMessage.contextState));
        } else if (newMessages.length === 0 && card?.char_book?.entries) {
             const initVarEntry = card.char_book.entries.find(e => e.comment?.includes('[InitVar]'));
             if (initVarEntry?.content) {
                 try { 
                     // Use parseLooseJson for robust parsing of initial variables
                     restoredVariables = parseLooseJson(initVarEntry.content); 
                 } catch (e) {}
             }
        }

        const findPreviousStateBlock = (history: ChatMessage[]): string => {
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].interactiveHtml) return history[i].interactiveHtml!;
            }
            return '';
        };
        restoredStateBlock = findPreviousStateBlock(newMessages);

        if (mergedSettings) {
            const chunkSize = mergedSettings.summarization_chunk_size || 10;
            const validSummaryCount = Math.floor(newMessages.length / chunkSize);
            
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

        setVariables(restoredVariables);
        setLastStateBlock(restoredStateBlock);
        setMessages(newMessages);
        
        logSystemMessage('interaction', 'system', `Rewound chat to before message index ${messageIndex}.`);

        await saveSession({
            messages: newMessages,
            variables: restoredVariables,
            lastStateBlock: restoredStateBlock
        });

    }, [messages, card, mergedSettings, longTermSummaries, isGenerating, isScanning, saveSession, setMessages, setVariables, setLastStateBlock, setLongTermSummaries, setSummaryQueue, logSystemMessage]);

    const deleteLastTurn = useCallback(async () => {
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
    }, [messages, deleteMessage]);

    const regenerateLastResponse = useCallback(async () => {
        if (isGenerating || isScanning || isGlobalSummarizing || !card || !preset || !mergedSettings) return;
        
        let lastUserMessageIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserMessageIndex = i;
                break;
            }
        }

        if (lastUserMessageIndex === -1) return;
        
        startTurn();

        const historyForRegen = messages.slice(0, lastUserMessageIndex + 1);
        const lastUserMessage = historyForRegen[historyForRegen.length - 1];
        
        let restoredVariables = variables;
        if (lastUserMessage.contextState) {
            restoredVariables = lastUserMessage.contextState;
            setVariables(restoredVariables);
            logSystemMessage('state', 'system', 'Restored variables for regeneration.');
        }
        
        const findPreviousStateBlock = (history: ChatMessage[], defaultBlock: string): string => {
            for (let i = history.length - 1; i >= 0; i--) {
                const msg = history[i];
                if (msg.interactiveHtml) return msg.interactiveHtml;
            }
            return defaultBlock;
        };
        const restoredStateBlock = findPreviousStateBlock(historyForRegen, '');
        setLastStateBlock(restoredStateBlock);

        const cleanInput = cleanMessageContent(lastUserMessage.content);
        const textToScan = cleanInput + '\n' + historyForRegen.slice(-4, -1).map(m => cleanMessageContent(m.content)).join('\n');
        const historyForScan = historyForRegen.slice(-10).map(m => `${m.role}: ${cleanMessageContent(m.content)}`);
        
        const { activeEntries, updatedRuntimeState, smartScanLog } = await scanInput(
            textToScan,
            worldInfoState,
            worldInfoRuntime,
            worldInfoPinned,
            mergedSettings,
            historyForScan,
            cleanInput, 
            restoredVariables 
        );

        if (smartScanLog) {
             logSmartScan(smartScanLog.fullPrompt, smartScanLog.rawResponse, smartScanLog.latency);
        }

        setWorldInfoRuntime(updatedRuntimeState);
        logWorldInfo(activeEntries);

        const promptMessages = historyForRegen.filter(m => m.role !== 'system');
        setMessages(historyForRegen);
        clearAiError();
        
        try {
             const { baseSections: dynamicSections } = prepareChat(
                card, 
                mergedSettings, 
                lorebooks, 
                persona, 
                undefined, 
                activeEntries,
                worldInfoPlacement
            );

            const chunkSize = mergedSettings.summarization_chunk_size || 10;
            const contextMode = mergedSettings.context_mode || 'standard';

            const { fullPrompt, structuredPrompt } = await constructChatPrompt(
                dynamicSections,
                promptMessages,
                authorNote,
                card,
                longTermSummaries,
                chunkSize, 
                restoredVariables,
                restoredStateBlock,
                lorebooks,
                contextMode,
                persona?.name || 'User',
                worldInfoState,
                activeEntries,
                worldInfoPlacement,
                mergedSettings
            );

             logPrompt(structuredPrompt);
             
             await saveSession({
                 messages: historyForRegen,
                 worldInfoRuntime: updatedRuntimeState,
                 variables: restoredVariables,
                 lastStateBlock: restoredStateBlock
             });
             
             if (mergedSettings.stream_response) {
                const streamMessage = createMessage('model', '...', undefined, undefined, restoredVariables);
                setMessages(prev => [...prev, streamMessage]);
                
                let rawAccumulatedText = '';
                
                const stream = generateStream(fullPrompt, mergedSettings);
                for await (const chunk of stream) {
                    rawAccumulatedText += chunk;
                    const display = cleanMessageContent(rawAccumulatedText);
                    
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const idx = newMsgs.findIndex(m => m.id === streamMessage.id);
                        if (idx !== -1) {
                            newMsgs[idx] = { ...newMsgs[idx], content: display };
                        }
                        return newMsgs;
                    });
                }
                
                setMessages(prev => prev.filter(m => m.id !== streamMessage.id)); 
                await processAndSetModelResponse(rawAccumulatedText, historyForRegen, restoredVariables);

             } else {
                 const response = await generate(fullPrompt, mergedSettings);
                 
                 if (response) {
                     const rawContent = response.text || '[Lỗi: AI đã trả về một phản hồi trống]';
                     await processAndSetModelResponse(rawContent, historyForRegen, restoredVariables);
                 } else {
                      setMessages(messages); // Restore old messages if fail
                 }
             }

        } catch (e) {
            console.error("Regenerate Error:", e);
            setMessages(messages); 
        }
    }, [messages, authorNote, card, preset, mergedSettings, longTermSummaries, isGenerating, isScanning, isGlobalSummarizing, logPrompt, processAndSetModelResponse, variables, worldInfoState, worldInfoRuntime, worldInfoPinned, worldInfoPlacement, lorebooks, persona, saveSession, logWorldInfo, logSmartScan, setMessages, setWorldInfoRuntime, generate, generateStream, clearAiError, scanInput, logSystemMessage, setLastStateBlock, startTurn]);

    const editMessage = useCallback(async (messageId: string, newContent: string) => {
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) return;
        const newMessages = [...messages];
        const updatedMessage = { ...newMessages[messageIndex], content: newContent };
        delete updatedMessage.interactiveHtml;
        delete updatedMessage.originalRawContent;
        newMessages[messageIndex] = updatedMessage;
        setMessages(newMessages);
        await saveSession({ messages: newMessages });
    }, [messages, saveSession, setMessages]);

    const updateAuthorNote = useCallback(async (newNote: string) => {
        setAuthorNote(newNote);
        await saveSession({ authorNote: newNote });
    }, [setAuthorNote, saveSession]);

    const updateWorldInfoState = useCallback(async (newState: Record<string, boolean>) => {
        setWorldInfoState(newState);
        await saveSession({ worldInfoState: newState });
    }, [setWorldInfoState, saveSession]);
    
    const updateWorldInfoPinned = useCallback(async (newPinnedState: Record<string, boolean>) => {
        setWorldInfoPinned(newPinnedState);
        await saveSession({ worldInfoPinned: newPinnedState });
    }, [setWorldInfoPinned, saveSession]);

    const updateWorldInfoPlacement = useCallback(async (newPlacementState: Record<string, 'before' | 'after' | undefined>) => {
        setWorldInfoPlacement(newPlacementState);
        await saveSession({ worldInfoPlacement: newPlacementState });
    }, [setWorldInfoPlacement, saveSession]);
    
    const updateVisualState = useCallback(async (type: 'bg' | 'music' | 'sound' | 'class', value: string) => {
        let newState: VisualState = {};
        setVisualState(prev => {
            newState = { ...prev };
            if (type === 'bg') newState.backgroundImage = value === 'off' ? undefined : value;
            if (type === 'music') newState.musicUrl = value === 'off' ? undefined : value;
            if (type === 'sound') newState.ambientSoundUrl = value; 
            if (type === 'class') newState.globalClass = value;
            return newState;
        });
        saveSession({ visualState: newState });
    }, [setVisualState, saveSession]);

    const updateExtensionSettings = useCallback(async (newSettings: Record<string, any>) => {
        setExtensionSettings(prev => {
            const updated = { ...prev, ...newSettings };
            saveSession({ extensionSettings: updated });
            return updated;
        });
    }, [saveSession]);

    useEffect(() => {
        const handleMessageFromIframe = (event: MessageEvent) => {
            if (!event.data || typeof event.data.type !== 'string') {
                return;
            }
            
            if (event.data.type === 'UPDATE_SCRIPT_BUTTONS') {
                if (event.data.payload) {
                    const { scriptId, buttons } = event.data.payload;
                    const processedButtons: ScriptButton[] = (buttons || []).map((btn: any, idx: number) => ({
                        id: `btn_${scriptId}_${idx}`,
                        label: btn.name || btn.label || 'Button',
                        scriptId: scriptId,
                        eventId: 'btn_click_' + (btn.name || btn.label || 'Button')
                    }));
                    
                    logSystemMessage('interaction', 'system', `Updated script buttons for ${scriptId}: ${processedButtons.length} buttons.`);
                    setScriptButtons(processedButtons);
                }
            }
        };
        window.addEventListener('message', handleMessageFromIframe);
        return () => window.removeEventListener('message', handleMessageFromIframe);
    }, [logSystemMessage]);

    const handleScriptButtonClick = useCallback((button: ScriptButton) => {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            iframe.contentWindow?.postMessage({
                type: 'EXECUTE_BUTTON_SCRIPT',
                payload: {
                    scriptId: button.scriptId,
                    buttonName: button.label 
                }
            }, '*');
        });
        
        logSystemMessage('interaction', 'system', `Clicked Script Button: ${button.label}`);
    }, [logSystemMessage]);


    const executeSlashCommands = useCallback(async (script: string) => {
        if (!script.trim()) return;
        const context: ScriptContext = {
            variables: variables,
            setVariables: (newVars) => {
                setVariables(newVars);
                saveSession({ variables: newVars });
            },
            sendMessage: (content, role = 'user') => {
                if (role === 'user') sendMessage(content);
                else addSystemMessage(content);
            },
            triggerSystemAction: (action, data) => {
                logSystemMessage('interaction', 'system', `System Action: ${action}`, undefined, data);
            },
            characterName: card?.name || 'Character',
            userPersonaName: persona?.name || 'User',
            log: (level, msg) => {
                let mappedLevel: any = 'log';
                if (level === 'error') mappedLevel = 'error';
                else if (level === 'warn') mappedLevel = 'warn';
                logSystemMessage(mappedLevel, 'script', msg);
            },
            setVisualState: updateVisualState,
            showToast: showToast,
            showPopup: showPopup,
            setQuickReplies: setQuickReplies,
            setIsInputLocked: setIsInputLocked 
        };
        await executeScript(script, context);
    }, [variables, setVariables, saveSession, sendMessage, addSystemMessage, card, persona, logSystemMessage, updateVisualState, showToast, showPopup]);

    return {
        messages, isLoading: isSessionLoading || isGenerating || isScanning || isGlobalSummarizing, isSummarizing: isGlobalSummarizing, error,
        sendMessage, addSystemMessage, deleteLastTurn, regenerateLastResponse, editMessage, deleteMessage, 
        authorNote, updateAuthorNote,
        worldInfoState, updateWorldInfoState,
        worldInfoPinned, updateWorldInfoPinned,
        worldInfoPlacement, updateWorldInfoPlacement,
        variables, setVariables,
        extensionSettings, updateExtensionSettings,
        logs, logSystemMessage, clearSystemLogs, clearLogs, 
        card, longTermSummaries,
        executeSlashCommands, visualState,
        quickReplies, setQuickReplies,
        scriptButtons, handleScriptButtonClick, 
        isInputLocked,
        preset,
        changePreset,
        updateVisualState, 
        saveSession, 
        isAutoLooping, setIsAutoLooping,
        queueLength, 
        triggerSmartContext,
        handleRegenerateSummary, 
        handleRetryFailedTask, // EXPORT RETRY
        summaryQueue // EXPORT QUEUE
    };
};

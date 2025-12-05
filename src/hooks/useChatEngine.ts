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
    const { generate, isGenerating, error: aiError, clearError: clearAiError } = useAICompletion();
    const { scanInput, processOutput, isScanning } = useWorldSystem(card);
    
    // Local transient state
    const [baseSections, setBaseSections] = useState<PromptSection[]>([]); // Store structured sections
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
    const [scriptButtons, setScriptButtons] = useState<ScriptButton[]>([]); // NEW: Dynamic Script Buttons
    const [isInputLocked, setIsInputLocked] = useState(false); // NEW: UI Lock State
    
    const messageIdCounter = useRef(0);
    
    // --- 3. Services & Hooks ---
    const { logs, startTurn, logPrompt, logResponse, logSummary, logDiagnostic, logWorldInfo, logSmartScan, logSystemMessage, clearLogs, clearSystemLogs } = useChatLogger();
    const { 
        isSummarizing, 
        checkForSummarizationAndStore,
        resetMemory,
        defaultPageSize
    } = useChatMemory(card?.name || 'Character');

    const { lorebooks } = useLorebook();
    const { showToast } = useToast();
    const { showPopup } = usePopup();
    
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

    // --- 5. Core Processing Logic ---

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
            
            // FIX: Only update the persistent state block if this is REAL HTML output found by Regex.
            // If it's just text forced into the iframe (isFallbackInteractive), we ignore it to prevent
            // polluting the context with narrative text/thinking.
            if (!isFallbackInteractive) {
                nextStateBlock = finalInteractiveHtml;
            }
        }
        
        if (modelMessages.length === 0) {
             modelMessages.push(createMessage('model', '(Không có nội dung hiển thị)', undefined, undefined, updatedVariables));
        }
        
        const finalNewMessages = [...currentMessages, ...modelMessages];
        
        setVariables(updatedVariables);
        setMessages(finalNewMessages);
        setLastStateBlock(nextStateBlock);

        const contextDepth = mergedSettings.context_depth || defaultPageSize;
        const summarizationPrompt = mergedSettings.summarization_prompt;

        const newSummaries = await checkForSummarizationAndStore(
            finalNewMessages, 
            logSummary, 
            contextDepth, 
            summarizationPrompt
        );
        
        const finalSummaries = newSummaries || longTermSummaries;
        if (newSummaries) setLongTermSummaries(newSummaries);

        await saveSession({
            messages: finalNewMessages,
            variables: updatedVariables,
            lastStateBlock: nextStateBlock,
            longTermSummaries: finalSummaries
        });

    }, [card, preset, mergedSettings, logResponse, logDiagnostic, checkForSummarizationAndStore, logSummary, saveSession, longTermSummaries, variables, lastStateBlock, setVariables, setMessages, setLongTermSummaries, setLastStateBlock, processOutput, defaultPageSize]);


    const sendMessage = useCallback(async (messageContent: string) => {
        if (!messageContent.trim() || !baseSections || isGenerating || isScanning || isSummarizing || !card || !preset || !mergedSettings) return;

        startTurn(); // Initialize new turn log container

        // --- 1. INPUT REGEX PROCESSING (PLACEMENT = 1) ---
        // Runs before anything else to transform user input
        const regexScripts = card.extensions?.regex_scripts || [];
        const { displayContent: processedInput, diagnosticLog: inputRegexLog } = processWithRegex(messageContent, regexScripts, [1]);
        
        if (inputRegexLog && inputRegexLog.length > 50) { // Only log if it actually did something significant or started/ended
            logDiagnostic(inputRegexLog, 'regex');
        }

        // Use processedInput for the message content
        const userMessage = createMessage('user', processedInput, undefined, undefined, variables);
        const currentMessages = [...messages, userMessage];
        setMessages(currentMessages);
        clearAiError();

        // --- WORLD INFO SCANNING ---
        // CLEANED INPUT FOR SCANNING
        const cleanInput = cleanMessageContent(processedInput);
        // Note: Only history for scan context, input is passed separately now for AI mode
        const textToScan = cleanInput + '\n' + currentMessages.slice(-3).map(m => cleanMessageContent(m.content)).join('\n');
        const historyForScan = currentMessages.slice(-10).map(m => `${m.role}: ${cleanMessageContent(m.content)}`);

        const { activeEntries, updatedRuntimeState, smartScanLog } = await scanInput(
            textToScan,
            worldInfoState,
            worldInfoRuntime,
            worldInfoPinned,
            mergedSettings,
            historyForScan,
            cleanInput, // Pass specific latest input
            variables // Pass current variables
        );
        
        if (smartScanLog) {
            logSmartScan(smartScanLog.fullPrompt, smartScanLog.rawResponse, smartScanLog.latency);
        }

        setWorldInfoRuntime(updatedRuntimeState);
        logWorldInfo(activeEntries); 

        try {
            const promptMessages = currentMessages.filter(m => m.role !== 'system');
            
            // Re-prepare dynamic sections with active WI
            const { baseSections: dynamicSections } = prepareChat(
                card, 
                mergedSettings, 
                lorebooks, 
                persona, 
                undefined, 
                activeEntries,
                worldInfoPlacement
            );
            
            const contextDepth = mergedSettings.context_depth || defaultPageSize;
            const contextMode = mergedSettings.context_mode || 'standard';

            // Construct the full prompt (returns both string and structure)
            const { fullPrompt, structuredPrompt } = await constructChatPrompt(
                dynamicSections, // Pass array, not string
                promptMessages,
                authorNote,
                card,
                longTermSummaries,
                contextDepth,
                variables,
                lastStateBlock,
                lorebooks, 
                contextMode,
                persona?.name || 'User',
                // NEW ARGS FOR INTERNAL RENDERING
                worldInfoState,
                activeEntries,
                worldInfoPlacement,
                mergedSettings // acts as preset
            );
            
            logPrompt(structuredPrompt); // Pass structured array for debugging
            
            await saveSession({
                messages: currentMessages,
                worldInfoRuntime: updatedRuntimeState
            });
            
            // Send full string to AI
            const response = await generate(fullPrompt, mergedSettings);
            
            if (response) {
                const rawContent = response.text || '[Lỗi: AI đã trả về một phản hồi trống]';
                await processAndSetModelResponse(rawContent, currentMessages, variables);
            } else {
                 setMessages(prev => prev.filter(m => m.id !== userMessage.id));
            }

        } catch (e) {
            console.error("SendMessage Error:", e);
             setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        }
    }, [baseSections, messages, authorNote, card, preset, mergedSettings, longTermSummaries, defaultPageSize, isGenerating, isScanning, isSummarizing, logPrompt, processAndSetModelResponse, variables, lastStateBlock, worldInfoState, worldInfoRuntime, worldInfoPinned, worldInfoPlacement, lorebooks, persona, saveSession, logWorldInfo, logSmartScan, setMessages, setWorldInfoRuntime, generate, clearAiError, scanInput, startTurn, logDiagnostic]);
    
    const addSystemMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;
        startTurn();
        const systemMsg = createMessage('system', content, undefined, undefined, variables);
        const newMessages = [...messages, systemMsg];
        setMessages(newMessages);
        await saveSession({ messages: newMessages });
    }, [messages, saveSession, setMessages, variables, startTurn]);

    const deleteLastTurn = useCallback(async () => {
        let newMessages = [...messages];
        if (newMessages.length === 0) return;
        const lastMessage = newMessages[newMessages.length - 1];
        
        if (lastMessage.role === 'model' && newMessages.length > 1) {
             const secondLastMessage = newMessages[newMessages.length - 2];
             if (secondLastMessage.role === 'user') {
                newMessages = newMessages.slice(0, -2);
             } else {
                newMessages = newMessages.slice(0, -1);
             }
        } else {
            newMessages = newMessages.slice(0, -1);
        }

        const lastRemainingMessage = newMessages.length > 0 ? newMessages[newMessages.length - 1] : null;
        let restoredVariables = variables; 

        if (lastRemainingMessage && lastRemainingMessage.contextState) {
            restoredVariables = lastRemainingMessage.contextState;
            setVariables(restoredVariables);
            // We don't start a new turn for delete, just log to system console
            logSystemMessage('state', 'system', 'Restored variables from history rollback.');
        }

        // Re-implement findPreviousStateBlock locally or import
        const findPreviousStateBlock = (history: ChatMessage[], defaultBlock: string): string => {
            for (let i = history.length - 1; i >= 0; i--) {
                const msg = history[i];
                if (msg.interactiveHtml) return msg.interactiveHtml;
            }
            return defaultBlock;
        };

        const restoredStateBlock = newMessages.length > 0 ? findPreviousStateBlock(newMessages, '') : '';
        setLastStateBlock(restoredStateBlock);
        if (restoredStateBlock) {
             logSystemMessage('state', 'system', 'Restored HTML State Block from history rollback.');
        }

        setMessages(newMessages);
        await saveSession({ 
            messages: newMessages, 
            variables: restoredVariables,
            lastStateBlock: restoredStateBlock
        });
    }, [messages, saveSession, setMessages, variables, logSystemMessage]);

    const regenerateLastResponse = useCallback(async () => {
        if (isGenerating || isScanning || isSummarizing || !card || !preset || !mergedSettings) return;
        
        let lastUserMessageIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserMessageIndex = i;
                break;
            }
        }

        if (lastUserMessageIndex === -1) return;
        
        startTurn(); // New turn for regen

        const historyForRegen = messages.slice(0, lastUserMessageIndex + 1);
        const lastUserMessage = historyForRegen[historyForRegen.length - 1];
        
        let restoredVariables = variables;
        if (lastUserMessage.contextState) {
            restoredVariables = lastUserMessage.contextState;
            setVariables(restoredVariables);
            logSystemMessage('state', 'system', 'Restored variables for regeneration.');
        }
        
        // Re-find state block
        const findPreviousStateBlock = (history: ChatMessage[], defaultBlock: string): string => {
            for (let i = history.length - 1; i >= 0; i--) {
                const msg = history[i];
                if (msg.interactiveHtml) return msg.interactiveHtml;
            }
            return defaultBlock;
        };
        const restoredStateBlock = findPreviousStateBlock(historyForRegen, '');
        setLastStateBlock(restoredStateBlock);

        // CLEANED INPUT FOR SCANNING
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
            cleanInput, // Pass specific latest input
            restoredVariables // Pass restored vars
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

            const contextDepth = mergedSettings.context_depth || defaultPageSize;
            const contextMode = mergedSettings.context_mode || 'standard';

            const { fullPrompt, structuredPrompt } = await constructChatPrompt(
                dynamicSections,
                promptMessages,
                authorNote,
                card,
                longTermSummaries,
                contextDepth,
                restoredVariables,
                restoredStateBlock,
                lorebooks,
                contextMode,
                persona?.name || 'User',
                // NEW ARGS
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
             
             const response = await generate(fullPrompt, mergedSettings);
             
             if (response) {
                 const rawContent = response.text || '[Lỗi: AI đã trả về một phản hồi trống]';
                 await processAndSetModelResponse(rawContent, historyForRegen, restoredVariables);
             } else {
                  setMessages(messages);
             }

        } catch (e) {
            console.error("Regenerate Error:", e);
            setMessages(messages); 
        }
    }, [messages, authorNote, card, preset, mergedSettings, longTermSummaries, defaultPageSize, isGenerating, isScanning, isSummarizing, logPrompt, processAndSetModelResponse, variables, worldInfoState, worldInfoRuntime, worldInfoPinned, worldInfoPlacement, lorebooks, persona, saveSession, logWorldInfo, logSmartScan, setMessages, setWorldInfoRuntime, generate, clearAiError, scanInput, logSystemMessage, setLastStateBlock, startTurn]);

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
                    // We process the button list to ensure they have IDs
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
        const lastInteractiveMessage = [...messages].reverse().find(m => m.interactiveHtml);
        // We need to find the iframe to send the message TO
        // We can broadcast to all, but ideally we target the active one.
        // Since we don't have the ref here, we'll use window.frames logic inside InteractiveHtmlMessage or just broadcast via window.postMessage if same origin,
        // but iframe is same origin.
        
        // Broadcasting to all iframes is safer for now as only the one with the script will react
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            iframe.contentWindow?.postMessage({
                type: 'EXECUTE_BUTTON_SCRIPT',
                payload: {
                    scriptId: button.scriptId,
                    buttonName: button.label // Passing label as ID for now as per simple mock
                }
            }, '*');
        });
        
        logSystemMessage('interaction', 'system', `Clicked Script Button: ${button.label}`);
    }, [messages, logSystemMessage]);


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
            setIsInputLocked: setIsInputLocked // Pass Lock Setter
        };
        await executeScript(script, context);
    }, [variables, setVariables, saveSession, sendMessage, addSystemMessage, card, persona, logSystemMessage, updateVisualState, showToast, showPopup]);

    return {
        messages, isLoading, isSummarizing, error,
        sendMessage, addSystemMessage, deleteLastTurn, regenerateLastResponse, editMessage,
        authorNote, updateAuthorNote,
        worldInfoState, updateWorldInfoState,
        worldInfoPinned, updateWorldInfoPinned,
        worldInfoPlacement, updateWorldInfoPlacement,
        variables, setVariables,
        extensionSettings, updateExtensionSettings,
        logs, logSystemMessage, clearSystemLogs,
        card, longTermSummaries,
        executeSlashCommands, visualState,
        quickReplies, setQuickReplies,
        scriptButtons, handleScriptButtonClick, // NEW EXPORTS
        isInputLocked,
        preset,
        changePreset
    };
};
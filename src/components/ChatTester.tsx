
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { ChatMessage, SystemLogEntry, QuickReply } from '../types';
import { Loader } from './Loader';
import { useChatEngine } from '../hooks/useChatEngine';
import { useCharacter } from '../contexts/CharacterContext';
import { useLorebook } from '../contexts/LorebookContext';
import { useToast } from './ToastSystem';
import { usePopup } from './PopupSystem';
import { useUserPersona } from '../contexts/UserPersonaContext';

// New Components
import { ChatLayout } from './Chat/ChatLayout';
import { ChatHeader } from './Chat/ChatHeader';
import { VisualLayer } from './Chat/VisualLayer';
import { DebugPanel } from './Chat/DebugPanel';
import { ChatModals } from './Chat/ChatModals';
import { ChatInput } from './Chat/ChatInput';
import { MessageList } from './Chat/MessageList';
import { GameHUD } from './Chat/GameHUD'; 
import { FloatingStatusHUD } from './Chat/FloatingStatusHUD'; // NEW: Import HUD

interface ChatTesterProps {
    sessionId: string;
    onBack: () => void;
}

export const ChatTester: React.FC<ChatTesterProps> = ({ sessionId, onBack }) => {
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [isAuthorNoteModalOpen, setIsAuthorNoteModalOpen] = useState(false);
    const [isWorldInfoModalOpen, setIsWorldInfoModalOpen] = useState(false);
    const [copyStatus, setCopyStatus] = useState(false);
    
    // New UI States
    const [isImmersive, setIsImmersive] = useState(false);
    const [isLorebookCreatorOpen, setIsLorebookCreatorOpen] = useState(false);
    const [lorebookKeyword, setLorebookKeyword] = useState('');
    const [isHUDOpen, setIsHUDOpen] = useState(false); // Variable HUD
    const [isStatusHUDOpen, setIsStatusHUDOpen] = useState(false); // NEW: Visual Card HUD
    
    const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
    const statusHudRef = useRef<HTMLIFrameElement | null>(null); // NEW: Ref for Floating HUD Iframe
    
    const { characters } = useCharacter();
    const { lorebooks } = useLorebook();
    const { activePersona } = useUserPersona();
    const { showToast } = useToast();
    const { showPopup } = usePopup();

    const {
        messages,
        isLoading,
        isSummarizing,
        error,
        sendMessage,
        addSystemMessage,
        deleteLastTurn,
        regenerateLastResponse,
        editMessage,
        authorNote,
        updateAuthorNote,
        worldInfoState,
        updateWorldInfoState,
        worldInfoPinned,
        updateWorldInfoPinned,
        worldInfoPlacement, 
        updateWorldInfoPlacement, 
        variables,
        setVariables, 
        extensionSettings, 
        updateExtensionSettings, 
        logs,
        logSystemMessage,
        clearSystemLogs,
        card,
        longTermSummaries,
        executeSlashCommands,
        visualState,
        quickReplies,
        setQuickReplies,
        scriptButtons, 
        handleScriptButtonClick 
    } = useChatEngine(sessionId);

    // Helper to trigger visual update from engine
    const handleVisualUpdate = (type: 'bg' | 'music' | 'sound' | 'class', value: string) => {
        executeSlashCommands(`/${type} ${value}`);
    };

    const character = characters.find(c => c.fileName === card?.fileName);
    const characterAvatarUrl = character?.avatarUrl || null;
    
    const characterName = card?.name || 'Character';
    const userPersonaName = activePersona?.name || 'User';
    
    // Determine the source for the Floating HUD (Most recent interactive message WITH ACTUAL HTML UI)
    const activeInteractiveMessage = useMemo(() => {
        // Define regex to detect actual structural HTML tags common in cards.
        // We want to avoid matching plain text that just happens to be in an interactive block.
        const uiStructureRegex = /<(div|style|script|table|details|img|link|meta)/i;

        // 1. Scan backwards for the latest message that looks like a UI
        const uiMessage = [...messages].reverse().find(m => 
            m.interactiveHtml && uiStructureRegex.test(m.interactiveHtml)
        );

        if (uiMessage) return uiMessage;

        // 2. Fallback: Usually the first message (Greeting) contains the main UI initialization
        if (messages.length > 0 && messages[0].interactiveHtml) {
            return messages[0];
        }

        return null;
    }, [messages]);

    // Post-generation triggers for Iframe
    useEffect(() => {
        const triggers = [];
        
        // 1. Trigger for Chat History Iframes
        const lastInteractiveMessage = [...messages].reverse().find(m => m.interactiveHtml);
        if (lastInteractiveMessage) {
            const iframe = iframeRefs.current[lastInteractiveMessage.id];
            if (iframe && iframe.contentWindow) triggers.push(iframe.contentWindow);
        }

        // 2. Trigger for Floating HUD Iframe
        if (statusHudRef.current && statusHudRef.current.contentWindow) {
            triggers.push(statusHudRef.current.contentWindow);
        }

        triggers.forEach(win => {
             if (isLoading) {
                 win.postMessage({ type: 'GENERATION_STARTED' }, '*');
             } else {
                 win.postMessage({ type: 'GENERATION_ENDED' }, '*');
             }
        });
    }, [isLoading, messages]);

    const parseQuickReplies = (commandArgs: string) => {
        const parts = commandArgs.split('|').map(s => s.trim()).filter(Boolean);
        const replies: QuickReply[] = parts.map(part => ({
            label: part,
            message: part
        }));
        setQuickReplies(replies);
    };

    const handleCommand = async (inputString: string) => {
        if (inputString.trim().startsWith('/qr')) {
             const args = inputString.substring(3).trim();
             parseQuickReplies(args);
             return;
        }
        await executeSlashCommands(inputString);
    };
    
    const getHandshakePayload = () => {
        const contextData = {
            characterId: card?.fileName || 'stcs_char_id',
            chatId: sessionId || 'stcs_chat_id',
            name1: userPersonaName,
            name2: characterName,
            groupId: null
        };

        const historySlice = messages.map((msg, index) => {
            const messageObj: any = {
                name: msg.role === 'user' ? userPersonaName : (msg.role === 'system' ? 'System' : characterName),
                is_user: msg.role === 'user',
                is_name: true,
                send_date: Date.now(), 
                mes: msg.content,
                swipes: [msg.content],
                swipes_data: [{}]
            };

            if (index === 0) {
                messageObj.data = { stat_data: variables };
            }

            return messageObj;
        });

        const worldInfoEntries = card?.char_book?.entries || [];
        
        return {
            stat_data: variables,
            context: contextData,
            chat_history: historySlice,
            world_info: worldInfoEntries 
        };
    };

    useEffect(() => {
        const handleMessageFromIframe = (event: MessageEvent) => {
            if (!event.data || typeof event.data.type !== 'string') {
                return;
            }
            
            if (event.data.type === 'HANDSHAKE_INIT') {
                const sourceWindow = event.source as Window;
                if (sourceWindow && variables) {
                    // This handshake now works for BOTH history iframes AND the status HUD iframe
                    sourceWindow.postMessage({
                        type: 'HANDSHAKE_ACK',
                        payload: getHandshakePayload()
                    }, '*');
                }
                return;
            }

            switch (event.data.type) {
                case 'interactive-action':
                    if (event.data.payload) {
                        const rawPayload = event.data.payload as string;
                        logSystemMessage('interaction', 'iframe', `Received command from card: ${rawPayload}`);
                        executeSlashCommands(rawPayload);
                    }
                    break;
                
                case 'iframe-log':
                    if (event.data.payload) {
                        const { level, message, stack, payload } = event.data.payload as any;
                        logSystemMessage(level, 'iframe', message, stack, payload);
                    }
                    break;

                case 'SHOW_TOAST':
                    if (event.data.payload) {
                        const { message, type } = event.data.payload;
                        showToast(message, type || 'info');
                    }
                    break;

                case 'SHOW_POPUP':
                    if (event.data.payload) {
                        const { html, type } = event.data.payload;
                        showPopup(html, `Thông báo: ${type || 'System'}`);
                    }
                    break;
                
                case 'QR_COMMAND':
                     if (event.data.payload) {
                         const args = (event.data.payload as string).substring(3).trim();
                         parseQuickReplies(args);
                     }
                     break;
                
                case 'SAVE_EXTENSION_SETTINGS':
                    if (event.data.payload) {
                        logSystemMessage('state', 'iframe', 'Saving extension settings from card.', undefined, JSON.stringify(event.data.payload));
                        updateExtensionSettings(event.data.payload);
                    }
                    break;
                
                case 'SET_INPUT_VALUE':
                    if (event.data.payload !== undefined) {
                        window.dispatchEvent(new CustomEvent('sillytavern:set-input', { detail: event.data.payload }));
                    }
                    break;

                default:
                    break;
            }
        };

        window.addEventListener('message', (event) => handleMessageFromIframe(event));
        return () => {
            window.removeEventListener('message', (event) => handleMessageFromIframe(event));
        };
    }, [variables, card, logSystemMessage, sendMessage, addSystemMessage, showToast, showPopup, messages, sessionId, userPersonaName, characterName, executeSlashCommands, updateExtensionSettings]); 
    
    // Broadcast State Updates to ALL Iframes (History + HUD)
    useEffect(() => {
        const windowsToUpdate: Window[] = [];

        // 1. History Iframes (Only active ones)
        const lastInteractiveMessage = [...messages].reverse().find(m => m.interactiveHtml);
        if (lastInteractiveMessage) {
            const iframe = iframeRefs.current[lastInteractiveMessage.id];
            if (iframe && iframe.contentWindow) windowsToUpdate.push(iframe.contentWindow);
        }

        // 2. Status HUD Iframe
        if (statusHudRef.current && statusHudRef.current.contentWindow) {
            windowsToUpdate.push(statusHudRef.current.contentWindow);
        }

        if (windowsToUpdate.length > 0) {
             const historyPayload = getHandshakePayload();
             
             windowsToUpdate.forEach(win => {
                 // Send Variables
                 if (variables && Object.keys(variables).length > 0) {
                    win.postMessage({
                        type: 'CARD_STUDIO_VARIABLE_UPDATE',
                        payload: { stat_data: variables }
                    }, '*');
                 }
                 
                 // Send History
                 win.postMessage({
                     type: 'CARD_STUDIO_HISTORY_UPDATE',
                     payload: { chat_history: historyPayload.chat_history }
                 }, '*');
             });
        }
    }, [variables, messages]);


    const handleStartEdit = (message: ChatMessage) => {
        setEditingMessageId(message.id);
        setEditingContent(message.content);
    };

    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setEditingContent('');
    };

    const handleSaveEdit = async () => {
        if (!editingMessageId || !editingContent.trim()) {
            setEditingMessageId(null);
            setEditingContent('');
            return;
        }
        await editMessage(editingMessageId, editingContent);
        setEditingMessageId(null);
        setEditingContent('');
    };

    const handleSendMessage = (text: string) => {
        setQuickReplies([]);
        if (text.startsWith('/')) {
            handleCommand(text);
        } else {
            sendMessage(text);
        }
    };
    
    const handleQuickReplyClick = (reply: QuickReply) => {
        setQuickReplies([]); 
        if (reply.action) {
             executeSlashCommands(reply.action);
        } else {
            sendMessage(reply.message || reply.label);
        }
    };
    
    const handleIframeLoad = (messageId: string) => {
         // Optional hook
    };

    const handleCopyIframeLogs = () => {
        const logText = logs.systemLog.map(log => {
            let entry = `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.source.toUpperCase()}] [${log.level.toUpperCase()}] ${log.message}`;
            if (log.stack) entry += `\n--- STACK TRACE ---\n${log.stack}`;
            if (log.payload) entry += `\n--- PAYLOAD ---\n${log.payload}`;
            return entry;
        }).reverse().join('\n\n================================\n\n');
        navigator.clipboard.writeText(logText).then(() => {
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
        });
    };
    
    const handleInspectState = () => {
        // Inspect logic can target both HUD and History
        logSystemMessage('state', 'system', 'Yêu cầu kiểm tra trạng thái.');
        if (statusHudRef.current?.contentWindow) {
             statusHudRef.current.contentWindow.postMessage({ type: 'CHECK_STATE' }, '*');
        } else {
            const lastInteractiveMessage = [...messages].reverse().find(m => m.interactiveHtml);
            if (lastInteractiveMessage) {
                const iframe = iframeRefs.current[lastInteractiveMessage.id];
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'CHECK_STATE' }, '*');
                }
            }
        }
    };

    if (!card) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Loader message="Đang tải phiên trò chuyện..." />
                <button onClick={onBack} className="mt-4 text-sky-400 hover:text-sky-300">Quay lại Sảnh</button>
            </div>
        );
    }

    return (
        <ChatLayout isImmersive={isImmersive} globalClass={visualState?.globalClass}>
             <VisualLayer visualState={visualState} isImmersive={isImmersive} />

             {/* GAME HUD (Native Variable Inspector) */}
             <GameHUD 
                variables={variables}
                isOpen={isHUDOpen}
                onClose={() => setIsHUDOpen(false)}
             />

             {/* FLOATING STATUS HUD (New Visual Card Interface) */}
             <FloatingStatusHUD
                ref={statusHudRef}
                isOpen={isStatusHUDOpen}
                onClose={() => setIsStatusHUDOpen(false)}
                htmlContent={activeInteractiveMessage?.interactiveHtml || ''}
                scripts={card.extensions?.TavernHelper_scripts || []}
                originalRawContent={activeInteractiveMessage?.originalRawContent || ''}
                variables={variables}
                extensionSettings={extensionSettings}
                characterName={characterName}
                userPersonaName={userPersonaName}
                characterId={card.fileName}
                sessionId={sessionId}
                characterAvatarUrl={characterAvatarUrl}
             />

            <ChatHeader 
                characterName={card.name}
                onBack={onBack}
                isImmersive={isImmersive}
                setIsImmersive={setIsImmersive}
                visualState={visualState}
                onVisualUpdate={handleVisualUpdate}
                onToggleHUD={() => setIsHUDOpen(!isHUDOpen)}
                isHUDOpen={isHUDOpen}
                onToggleStatusHUD={() => setIsStatusHUDOpen(!isStatusHUDOpen)}
                isStatusHUDOpen={isStatusHUDOpen}
            />
            
            <MessageList 
                messages={messages}
                isLoading={isLoading}
                isImmersive={isImmersive}
                characterName={characterName}
                characterAvatarUrl={characterAvatarUrl}
                userPersonaName={userPersonaName}
                characterId={card.fileName}
                sessionId={sessionId}
                editingMessageId={editingMessageId}
                editingContent={editingContent}
                setEditingContent={setEditingContent}
                onStartEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
                onSaveEdit={handleSaveEdit}
                regenerateLastResponse={regenerateLastResponse}
                deleteLastTurn={deleteLastTurn}
                onOpenAuthorNote={() => setIsAuthorNoteModalOpen(true)}
                onOpenWorldInfo={() => setIsWorldInfoModalOpen(true)}
                scripts={card?.extensions?.TavernHelper_scripts || []}
                variables={variables}
                extensionSettings={extensionSettings} 
                iframeRefs={iframeRefs}
                onIframeLoad={handleIframeLoad}
            />

             {error && <p className="p-4 text-red-400 text-center relative z-10">{error}</p>}
            
            <ChatInput
                onSend={handleSendMessage}
                isLoading={isLoading || !!editingMessageId}
                isImmersive={isImmersive}
                quickReplies={quickReplies}
                onQuickReplyClick={handleQuickReplyClick}
                scriptButtons={scriptButtons} 
                onScriptButtonClick={handleScriptButtonClick} 
                authorNote={authorNote}
                onUpdateAuthorNote={updateAuthorNote}
                isSummarizing={isSummarizing}
            >
                <DebugPanel 
                    logs={logs}
                    onClearLogs={clearSystemLogs}
                    onInspectState={handleInspectState}
                    onCopyLogs={handleCopyIframeLogs}
                    copyStatus={copyStatus}
                    isImmersive={isImmersive}
                    onLorebookCreatorOpen={() => {
                        setIsLorebookCreatorOpen(true);
                        setLorebookKeyword('');
                    }}
                />
            </ChatInput>

            <ChatModals 
                isAuthorNoteOpen={isAuthorNoteModalOpen}
                setIsAuthorNoteOpen={setIsAuthorNoteModalOpen}
                authorNote={authorNote}
                updateAuthorNote={updateAuthorNote}
                
                isWorldInfoOpen={isWorldInfoModalOpen}
                setIsWorldInfoOpen={setIsWorldInfoModalOpen}
                worldInfoEntries={card.char_book?.entries || []}
                worldInfoState={worldInfoState}
                worldInfoPinned={worldInfoPinned}
                worldInfoPlacement={worldInfoPlacement} 
                updateWorldInfoState={updateWorldInfoState}
                updateWorldInfoPinned={updateWorldInfoPinned}
                updateWorldInfoPlacement={updateWorldInfoPlacement} 

                isLorebookCreatorOpen={isLorebookCreatorOpen}
                setIsLorebookCreatorOpen={setIsLorebookCreatorOpen}
                lorebookKeyword={lorebookKeyword}
                setLorebookKeyword={setLorebookKeyword}
                messages={messages}
                longTermSummaries={longTermSummaries}
                lorebooks={lorebooks}
            />
        </ChatLayout>
    );
};


import React, { useRef, useEffect } from 'react';
import type { ChatMessage, TavernHelperScript } from '../../types';
import { InteractiveHtmlMessage } from '../InteractiveHtmlMessage';
import { MessageBubble, ThinkingReveal, MessageMenu } from './MessageBubble';
import { Loader } from '../Loader';

interface MessageListProps {
    messages: ChatMessage[];
    isLoading: boolean;
    isImmersive: boolean;
    
    // Character / User Info
    characterName: string;
    characterAvatarUrl: string | null;
    userPersonaName: string;
    characterId: string;
    sessionId: string;
    
    // Editing State
    editingMessageId: string | null;
    editingContent: string;
    setEditingContent: (content: string) => void;
    onStartEdit: (msg: ChatMessage) => void;
    onCancelEdit: () => void;
    onSaveEdit: () => void;

    // Actions
    regenerateLastResponse: () => void;
    deleteLastTurn: () => void;
    onOpenAuthorNote: () => void;
    onOpenWorldInfo: () => void;
    
    // Data
    scripts: TavernHelperScript[];
    variables: any; // For initial data in interactive cards
    extensionSettings: any; // NEW
    
    // Refs
    iframeRefs: React.MutableRefObject<Record<string, HTMLIFrameElement | null>>;
    onIframeLoad: (id: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    isLoading,
    isImmersive,
    characterName,
    characterAvatarUrl,
    userPersonaName,
    characterId,
    sessionId,
    editingMessageId,
    editingContent,
    setEditingContent,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    regenerateLastResponse,
    deleteLastTurn,
    onOpenAuthorNote,
    onOpenWorldInfo,
    scripts,
    variables,
    extensionSettings,
    iframeRefs,
    onIframeLoad
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!editingMessageId) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, editingMessageId]);

    // Determine last model message index for highlighting
    let lastModelMsgIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'model') {
            lastModelMsgIndex = i;
            break;
        }
    }

    // Determine absolute last message index for control logic
    const lastMessageIndex = messages.length - 1;

    return (
        <div 
            className={`flex-grow p-4 md:p-6 overflow-y-auto custom-scrollbar relative z-10 w-full ${isImmersive ? 'max-w-5xl mx-auto transition-all' : ''}`}
        >
            {messages.map((msg, index) => {
                // Calculate logic for ALL messages types
                const isLastMessage = index === lastMessageIndex;
                const isLastModelMessage = index === lastModelMsgIndex;
                
                // Allow actions if it is the LAST Model message OR the LAST User message (e.g. error case)
                const canRegenerate = (isLastModelMessage || (isLastMessage && msg.role === 'user')) && !isLoading && msg.role !== 'system';
                const canDelete = (isLastModelMessage || isLastMessage) && !isLoading && messages.length > 0;

                const menuActions = [
                    { label: 'Chỉnh sửa', onClick: () => onStartEdit(msg) },
                    { label: 'Ghi chú của Tác giả', onClick: onOpenAuthorNote },
                    { label: 'Quản lý World Info', onClick: onOpenWorldInfo },
                    { 
                        label: msg.role === 'user' ? 'Thử lại (Gửi lại)' : 'Tạo lại', 
                        onClick: regenerateLastResponse, 
                        disabled: !canRegenerate 
                    },
                    { 
                        label: msg.role === 'user' ? 'Xóa tin nhắn này' : 'Xóa Lượt gần nhất', 
                        onClick: deleteLastTurn, 
                        disabled: !canDelete, 
                        className: 'text-red-400 hover:bg-red-800/50' 
                    },
                ];

                if (msg.interactiveHtml) {
                    // Logic to separate <thinking> content from interactive HTML
                    let finalHtml = msg.interactiveHtml;
                    let thinkingContent: string | null = null;

                    // Robust regex to find the thinking block, allowing for newlines and various content
                    const thinkingMatch = finalHtml.match(/<thinking>([\s\S]*?)<\/thinking>/i);
                    
                    if (thinkingMatch) {
                        thinkingContent = thinkingMatch[1].trim();
                        // Remove the thinking block from the HTML passed to the iframe
                        // so it doesn't show up as raw text or duplicate inside the card UI
                        finalHtml = finalHtml.replace(thinkingMatch[0], '');
                    }

                    return (
                        <div key={msg.id} className="my-4 relative group">
                            {/* Floating Menu for Interactive Messages */}
                            <div className="absolute top-0 right-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto p-2">
                                <div className="bg-slate-800/90 rounded-full shadow-md backdrop-blur-sm border border-slate-600/50">
                                    <MessageMenu actions={menuActions} isUser={false} />
                                </div>
                            </div>

                            {thinkingContent && (
                                <div className="mb-2">
                                    <ThinkingReveal content={thinkingContent} />
                                </div>
                            )}
                            <InteractiveHtmlMessage 
                              ref={(el) => { iframeRefs.current[msg.id] = el; }}
                              htmlContent={finalHtml} 
                              scripts={scripts}
                              originalContent={msg.originalRawContent || ''}
                              initialData={variables}
                              extensionSettings={extensionSettings} // Pass settings
                              onLoad={() => onIframeLoad(msg.id)}
                              characterName={characterName}
                              userPersonaName={userPersonaName}
                              characterId={characterId} 
                              chatId={sessionId}
                              chatHistory={messages}
                              userAvatarUrl={characterAvatarUrl || undefined}
                            />
                        </div>
                    );
                }
                
                // Skip empty messages unless editing
                if (!msg.content.trim() && editingMessageId !== msg.id) return null;

                return (
                    <MessageBubble 
                        key={msg.id} 
                        message={msg} 
                        avatarUrl={characterAvatarUrl}
                        isEditing={editingMessageId === msg.id}
                        editingContent={editingContent}
                        onContentChange={setEditingContent}
                        onSave={onSaveEdit}
                        onCancel={onCancelEdit}
                        menuActions={menuActions}
                        isImmersive={isImmersive}
                    />
                );
            })}
            
            {isLoading && (
                <div className="flex items-start gap-3 my-4 flex-row">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex-shrink-0 overflow-hidden">
                       {characterAvatarUrl && <img src={characterAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />}
                    </div>
                    <div className={`rounded-lg px-4 py-2 max-w-lg bg-slate-700/90 text-slate-200 rounded-bl-none ${isImmersive ? 'backdrop-blur-md' : ''}`}>
                       <Loader message="Đang phân tích bối cảnh & tạo câu trả lời..." />
                     </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>
    );
};


import React, { useState, useRef, useMemo } from 'react';
import { useChatEngine } from '../hooks/useChatEngine';
import { useCharacter } from '../contexts/CharacterContext';
import { useUserPersona } from '../contexts/UserPersonaContext';
import { useLorebook } from '../contexts/LorebookContext';
import { ChatHeader } from './Chat/ChatHeader';
import { MessageList } from './Chat/MessageList';
import { ChatInput } from './Chat/ChatInput';
import { ChatLayout } from './Chat/ChatLayout';
import { VisualLayer } from './Chat/VisualLayer';
import { DebugPanel } from './Chat/DebugPanel';
import { ChatModals } from './Chat/ChatModals';
import { AssistantPanel } from './Chat/AssistantPanel';
import { GameHUD } from './Chat/GameHUD';
import { FloatingStatusHUD } from './Chat/FloatingStatusHUD';
import { Loader } from './Loader';
import { applyVariableOperation } from '../services/variableEngine'; // Import Variable Engine logic

interface ChatTesterProps {
    sessionId: string;
    onBack: () => void;
}

export const ChatTester: React.FC<ChatTesterProps> = ({ sessionId, onBack }) => {
    const {
        messages, isLoading, isSummarizing, error,
        sendMessage, deleteLastTurn, regenerateLastResponse, editMessage,
        authorNote, updateAuthorNote,
        worldInfoState, updateWorldInfoState,
        worldInfoPinned, updateWorldInfoPinned,
        worldInfoPlacement, updateWorldInfoPlacement,
        variables, setVariables,
        extensionSettings,
        logs, clearLogs,
        card, longTermSummaries,
        visualState, updateVisualState,
        quickReplies,
        scriptButtons, handleScriptButtonClick,
        isInputLocked,
        preset, changePreset,
        saveSession,
        isAutoLooping, setIsAutoLooping // NEW
    } = useChatEngine(sessionId);

    const { characters } = useCharacter();
    const { activePersona } = useUserPersona();
    const { lorebooks } = useLorebook();

    const [isImmersive, setIsImmersive] = useState(false);
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const [isHUDOpen, setIsHUDOpen] = useState(false);
    const [isStatusHUDOpen, setIsStatusHUDOpen] = useState(false);
    const [isAuthorNoteOpen, setIsAuthorNoteOpen] = useState(false);
    const [isWorldInfoOpen, setIsWorldInfoOpen] = useState(false);
    const [isLorebookCreatorOpen, setIsLorebookCreatorOpen] = useState(false);
    const [lorebookKeyword, setLorebookKeyword] = useState('');
    
    // Edit state
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');

    const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

    const handleStartEdit = (msg: any) => {
        setEditingMessageId(msg.id);
        setEditingContent(msg.content);
    };

    const handleCancelEdit = () => {
        setEditingMessageId(null);
        setEditingContent('');
    };

    const handleSaveEdit = () => {
        if (editingMessageId) {
            editMessage(editingMessageId, editingContent);
            handleCancelEdit();
        }
    };

    // --- ASSISTANT ACTION HANDLERS ---
    
    // Allows Assistant to update a deep variable safely using the Engine
    const handleUpdateVariable = (key: string, value: any) => {
        // Use applyVariableOperation which handles:
        // 1. Path normalization (removing 'stat_data.' prefix if AI added it)
        // 2. Tuple preservation (updating [val, desc] correctly)
        // 3. Immutability (returns a new object)
        try {
            const newVariables = applyVariableOperation(variables, 'set', key, value);
            setVariables(newVariables);
            saveSession({ variables: newVariables });
        } catch (e) {
            console.error("Failed to update variable via Assistant:", e);
        }
    };

    const handleRewriteLastTurn = (messageId: string, newContent: string) => {
        editMessage(messageId, newContent);
    };

    const handleIframeLoad = (id: string) => {
        // console.log(`Iframe ${id} loaded`);
    };

    const characterAvatarUrl = useMemo(() => {
        if (!card) return null;
        const charInContext = characters.find(c => c.fileName === card.fileName);
        return charInContext?.avatarUrl || null;
    }, [card, characters]);

    // Find last interactive message for Status HUD
    const lastInteractiveMsg = useMemo(() => {
        const reversed = [...messages].reverse();
        return reversed.find(m => m.interactiveHtml);
    }, [messages]);

    if (!card || !preset) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader message="Đang tải phiên trò chuyện..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-full gap-4 text-red-400">
                <p>Lỗi: {error}</p>
                <button onClick={onBack} className="text-slate-300 underline">Quay lại</button>
            </div>
        );
    }

    return (
        <ChatLayout isImmersive={isImmersive} globalClass={visualState.globalClass}>
            <VisualLayer visualState={visualState} isImmersive={isImmersive} />
            
            <ChatHeader 
                characterName={card.name}
                onBack={onBack}
                isImmersive={isImmersive}
                setIsImmersive={setIsImmersive}
                visualState={visualState}
                onVisualUpdate={updateVisualState}
                onToggleHUD={() => setIsHUDOpen(!isHUDOpen)}
                isHUDOpen={isHUDOpen}
                onToggleStatusHUD={() => setIsStatusHUDOpen(!isStatusHUDOpen)}
                isStatusHUDOpen={isStatusHUDOpen}
                activePresetName={preset.name}
                onPresetChange={changePreset}
                onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
                isAssistantOpen={isAssistantOpen}
            />

            <MessageList 
                messages={messages}
                isLoading={isLoading}
                isImmersive={isImmersive}
                characterName={card.name}
                characterAvatarUrl={characterAvatarUrl}
                userPersonaName={activePersona?.name || 'User'}
                characterId={sessionId}
                sessionId={sessionId}
                editingMessageId={editingMessageId}
                editingContent={editingContent}
                setEditingContent={setEditingContent}
                onStartEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
                onSaveEdit={handleSaveEdit}
                regenerateLastResponse={regenerateLastResponse}
                deleteLastTurn={deleteLastTurn}
                onOpenAuthorNote={() => setIsAuthorNoteOpen(true)}
                onOpenWorldInfo={() => setIsWorldInfoOpen(true)}
                scripts={card.extensions?.TavernHelper_scripts || []}
                variables={variables}
                extensionSettings={extensionSettings}
                iframeRefs={iframeRefs}
                onIframeLoad={handleIframeLoad}
            />

            <ChatInput
                onSend={sendMessage}
                isLoading={isLoading}
                isImmersive={isImmersive}
                quickReplies={quickReplies}
                onQuickReplyClick={(qr) => sendMessage(qr.message || qr.label)}
                scriptButtons={scriptButtons}
                onScriptButtonClick={handleScriptButtonClick}
                authorNote={authorNote}
                onUpdateAuthorNote={updateAuthorNote}
                isSummarizing={isSummarizing}
                isInputLocked={isInputLocked}
                isAutoLooping={isAutoLooping} // Pass state
                onToggleAutoLoop={() => setIsAutoLooping(!isAutoLooping)} // Pass handler
            >
                <DebugPanel 
                    logs={logs} 
                    onClearLogs={clearLogs} 
                    onInspectState={() => setIsHUDOpen(true)} 
                    onCopyLogs={() => {}} 
                    copyStatus={false} 
                    isImmersive={isImmersive}
                    onLorebookCreatorOpen={() => setIsLorebookCreatorOpen(true)}
                />
            </ChatInput>

            <ChatModals 
                isAuthorNoteOpen={isAuthorNoteOpen}
                setIsAuthorNoteOpen={setIsAuthorNoteOpen}
                authorNote={authorNote}
                updateAuthorNote={updateAuthorNote}
                isWorldInfoOpen={isWorldInfoOpen}
                setIsWorldInfoOpen={setIsWorldInfoOpen}
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

            <AssistantPanel 
                isOpen={isAssistantOpen}
                onClose={() => setIsAssistantOpen(false)}
                gameHistory={messages}
                card={card}
                variables={variables}
                logs={logs}
                onUpdateVariable={handleUpdateVariable}
                onRewriteMessage={handleRewriteLastTurn}
            />

            <GameHUD 
                variables={variables}
                isOpen={isHUDOpen}
                onClose={() => setIsHUDOpen(false)}
            />

            <FloatingStatusHUD 
                ref={(el) => { if(el) iframeRefs.current['hud'] = el; }}
                isOpen={isStatusHUDOpen}
                onClose={() => setIsStatusHUDOpen(false)}
                htmlContent={lastInteractiveMsg?.interactiveHtml || ''}
                scripts={card.extensions?.TavernHelper_scripts || []}
                originalRawContent={lastInteractiveMsg?.originalRawContent || ''}
                variables={variables}
                extensionSettings={extensionSettings}
                characterName={card.name}
                userPersonaName={activePersona?.name || 'User'}
                characterId={sessionId}
                sessionId={sessionId}
                characterAvatarUrl={characterAvatarUrl}
            />
        </ChatLayout>
    );
};


import React, { useState, useRef, useMemo, useEffect } from 'react';
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
import { applyVariableOperation } from '../services/variableEngine'; 
import { countTotalTurns } from '../hooks/useChatMemory'; 
import { RpgDashboard } from './Chat/RpgDashboard';
import { ErrorResolutionModal } from './ErrorResolutionModal'; // IMPORT MODAL

interface ChatTesterProps {
    sessionId: string;
    onBack: () => void;
}

export const ChatTester: React.FC<ChatTesterProps> = ({ sessionId, onBack }) => {
    const {
        messages, isLoading, isSummarizing, error,
        sendMessage, stopGeneration, 
        deleteLastTurn, deleteMessage, regenerateLastResponse, editMessage,
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
        isAutoLooping, setIsAutoLooping,
        queueLength, 
        summaryQueue,
        triggerSmartContext,
        handleRegenerateSummary,
        handleRetryFailedTask,
        resetStore,
        interactiveError, // NEW: Error State
        handleUserDecision // NEW: Decision Handler
    } = useChatEngine(sessionId);

    const { characters } = useCharacter();
    const { activePersona } = useUserPersona();
    const { lorebooks } = useLorebook();

    const [isImmersive, setIsImmersive] = useState(false);
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const [isHUDOpen, setIsHUDOpen] = useState(false);
    const [isStatusHUDOpen, setIsStatusHUDOpen] = useState(false);
    const [isRpgDashboardOpen, setIsRpgDashboardOpen] = useState(false);
    const [isAuthorNoteOpen, setIsAuthorNoteOpen] = useState(false);
    const [isWorldInfoOpen, setIsWorldInfoOpen] = useState(false);
    const [isLorebookCreatorOpen, setIsLorebookCreatorOpen] = useState(false);
    const [lorebookKeyword, setLorebookKeyword] = useState('');
    
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');

    const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

    // CLEANUP: Reset store when leaving chat to prevent stale data flashing
    useEffect(() => {
        return () => {
            resetStore();
        };
    }, [resetStore]);

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

    const handleUpdateVariable = (key: string, value: any) => {
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
    };

    const characterAvatarUrl = useMemo(() => {
        if (!card) return null;
        const charInContext = characters.find(c => c.fileName === card.fileName);
        return charInContext?.avatarUrl || null;
    }, [card, characters]);

    const lastInteractiveMsg = useMemo(() => {
        const reversed = [...messages].reverse();
        return reversed.find(m => m.interactiveHtml);
    }, [messages]);

    const currentTurnCount = useMemo(() => countTotalTurns(messages), [messages]);

    const isInitializing = isLoading && (!card || !preset);

    if (isInitializing) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader message="Đang tải phiên trò chuyện..." />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-full gap-4 text-red-400">
                <p className="text-center px-4">Lỗi: {error}</p>
                <button onClick={onBack} className="text-slate-300 underline hover:text-white transition-colors">Quay lại</button>
            </div>
        );
    }

    if (!card || !preset) {
        return (
            <div className="flex flex-col justify-center items-center h-full gap-4 text-amber-400">
                <p className="text-center px-4 font-bold text-xl">Dữ liệu không khả dụng</p>
                <p className="text-center px-4 text-slate-400">
                    Không tìm thấy thẻ nhân vật hoặc preset tương ứng.<br/>
                    Có thể bạn đã xóa nhân vật gốc hoặc preset này?
                </p>
                <button onClick={onBack} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors">
                    Quay lại Sảnh
                </button>
            </div>
        );
    }

    const contextDepth = preset.context_depth || 20;
    const chunkSize = preset.summarization_chunk_size || 10;

    return (
        <ChatLayout isImmersive={isImmersive} globalClass={visualState.globalClass}>
            <VisualLayer visualState={visualState} isImmersive={isImmersive} />
            
            <ChatHeader 
                characterName={card.name}
                onBack={() => {
                    saveSession({}, true); // Force immediate save on back
                    onBack();
                }}
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
                hasRpgData={!!card.rpg_data}
                onToggleRpgDashboard={() => setIsRpgDashboardOpen(!isRpgDashboardOpen)}
                isRpgDashboardOpen={isRpgDashboardOpen}
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
                onDeleteMessage={deleteMessage} 
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
                onStop={stopGeneration}
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
                isAutoLooping={isAutoLooping} 
                onToggleAutoLoop={() => setIsAutoLooping(!isAutoLooping)} 
                queueLength={queueLength} 
            >
                <DebugPanel 
                    logs={logs} 
                    onClearLogs={clearLogs} 
                    onInspectState={() => setIsHUDOpen(true)} 
                    onCopyLogs={() => {}} 
                    copyStatus={false} 
                    isImmersive={isImmersive}
                    onLorebookCreatorOpen={() => setIsLorebookCreatorOpen(true)}
                    summaryStats={{
                        messageCount: currentTurnCount,
                        summaryCount: longTermSummaries.length,
                        contextDepth: contextDepth,
                        chunkSize: chunkSize,
                        queueLength: queueLength
                    }}
                    longTermSummaries={longTermSummaries}
                    summaryQueue={summaryQueue}
                    onForceSummarize={triggerSmartContext}
                    onRegenerateSummary={handleRegenerateSummary} 
                    onRetryFailedTask={handleRetryFailedTask}
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

            <RpgDashboard 
                data={card.rpg_data}
                isOpen={isRpgDashboardOpen}
                onClose={() => setIsRpgDashboardOpen(false)}
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

            {/* Error Handling Modal */}
            <ErrorResolutionModal 
                errorState={interactiveError}
                onRetry={() => handleUserDecision('retry')}
                onIgnore={() => handleUserDecision('ignore')}
            />
        </ChatLayout>
    );
};

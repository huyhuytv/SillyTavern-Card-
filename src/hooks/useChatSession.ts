
import { useState, useEffect, useCallback } from 'react';
import type { ChatSession, ChatMessage, CharacterCard, SillyTavernPreset, UserPersona, VisualState, WorldInfoRuntimeStats } from '../types';
import * as dbService from '../services/dbService';
import { useCharacter } from '../contexts/CharacterContext';
import { usePreset } from '../contexts/PresetContext';
import { useUserPersona } from '../contexts/UserPersonaContext';
import { mergeSettings } from '../services/settingsMerger';
import { truncateText } from '../utils';

export interface SessionState {
    messages: ChatMessage[];
    variables: Record<string, any>;
    extensionSettings: Record<string, any>; // NEW STATE
    worldInfoState: Record<string, boolean>;
    worldInfoPinned: Record<string, boolean>;
    worldInfoPlacement: Record<string, 'before' | 'after' | undefined>;
    worldInfoRuntime: Record<string, WorldInfoRuntimeStats>;
    visualState: VisualState;
    authorNote: string;
    lastStateBlock: string;
    longTermSummaries: string[];
    card: CharacterCard | null;
    preset: SillyTavernPreset | null;
    persona: UserPersona | null;
    mergedSettings: SillyTavernPreset | null;
    isLoading: boolean;
    error: string;
}

export const useChatSession = (sessionId: string | null) => {
    // Core Session State
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [variables, setVariables] = useState<Record<string, any>>({});
    const [extensionSettings, setExtensionSettings] = useState<Record<string, any>>({}); // NEW
    const [worldInfoState, setWorldInfoState] = useState<Record<string, boolean>>({});
    const [worldInfoPinned, setWorldInfoPinned] = useState<Record<string, boolean>>({});
    const [worldInfoPlacement, setWorldInfoPlacement] = useState<Record<string, 'before' | 'after' | undefined>>({});
    const [worldInfoRuntime, setWorldInfoRuntime] = useState<Record<string, WorldInfoRuntimeStats>>({});
    const [visualState, setVisualState] = useState<VisualState>({});
    const [authorNote, setAuthorNote] = useState<string>('');
    const [lastStateBlock, setLastStateBlock] = useState<string>('');
    const [longTermSummaries, setLongTermSummaries] = useState<string[]>([]);
    const [initialDiagnosticLog, setInitialDiagnosticLog] = useState<string>('');
    
    // References
    const [card, setCard] = useState<CharacterCard | null>(null);
    const [preset, setPreset] = useState<SillyTavernPreset | null>(null);
    const [persona, setPersona] = useState<UserPersona | null>(null);
    const [mergedSettings, setMergedSettings] = useState<SillyTavernPreset | null>(null);

    // Status
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');

    // Contexts for resolution
    const { characters } = useCharacter();
    const { presets } = usePreset();
    const { personas } = useUserPersona();

    // Load Session Data
    useEffect(() => {
        const initializeSession = async () => {
            if (!sessionId) {
                setIsLoading(false);
                return;
            }

            // Only load if contexts are ready (simple check based on array existence)
            if (!characters || !presets || !personas) return;

            setIsLoading(true);
            setError('');

            try {
                const session = await dbService.getChatSession(sessionId);
                if (!session) {
                    throw new Error("Không tìm thấy phiên trò chuyện.");
                }

                // Resolve References
                const sessionCardContext = characters.find(c => c.fileName === session.characterFileName);
                const sessionCard = sessionCardContext?.card;
                const sessionPreset = presets.find(p => p.name === session.presetName);
                const sessionPersona = personas.find(p => p.id === session.userPersonaId) || null;

                if (!sessionCard || !sessionPreset) {
                    throw new Error("Nhân vật hoặc preset cho phiên này không còn tồn tại.");
                }

                // Ensure fileName is attached to card for later use
                sessionCard.fileName = session.characterFileName;

                // Restore State
                setCard(sessionCard);
                setPreset(sessionPreset);
                setPersona(sessionPersona);
                setMergedSettings(mergeSettings(sessionCard, sessionPreset));

                setMessages(session.chatHistory);
                setVariables(session.variables || {});
                setExtensionSettings(session.extensionSettings || {}); // LOAD EXT SETTINGS
                setVisualState(session.visualState || {});
                setAuthorNote(session.authorNote || '');
                setLastStateBlock(session.lastStateBlock || '');
                setLongTermSummaries(session.longTermSummaries || []);
                setWorldInfoRuntime(session.worldInfoRuntime || {});
                setWorldInfoPinned(session.worldInfoPinned || {});
                setWorldInfoPlacement(session.worldInfoPlacement || {});
                setInitialDiagnosticLog(session.initialDiagnosticLog || '');

                // Initialize WI State: Use session state or default to enabled from card
                let initialWorldInfoState: Record<string, boolean> = {};
                if (session.worldInfoState) {
                    initialWorldInfoState = session.worldInfoState;
                } else if (sessionCard.char_book?.entries) {
                    sessionCard.char_book.entries.forEach(entry => {
                        if (entry.uid) initialWorldInfoState[entry.uid] = entry.enabled !== false;
                    });
                }
                setWorldInfoState(initialWorldInfoState);

            } catch (e) {
                console.error("Session load error:", e);
                setError(e instanceof Error ? e.message : 'Không thể tải phiên trò chuyện.');
            } finally {
                setIsLoading(false);
            }
        };

        initializeSession();
    }, [sessionId, characters, presets, personas]);


    /**
     * Persist the current state to IndexedDB.
     * Accepts optional overrides to save the *next* state before React state updates flush.
     */
    const saveSession = useCallback(async (overrides: Partial<SessionState> = {}) => {
        if (!sessionId || !card || !preset) return;

        // Use overrides if provided, otherwise use current state
        const currentMessages = overrides.messages ?? messages;
        const currentVariables = overrides.variables ?? variables;
        const currentExtensionSettings = overrides.extensionSettings ?? extensionSettings;
        const currentWorldInfoState = overrides.worldInfoState ?? worldInfoState;
        const currentWorldInfoPinned = overrides.worldInfoPinned ?? worldInfoPinned;
        const currentWorldInfoPlacement = overrides.worldInfoPlacement ?? worldInfoPlacement;
        const currentWorldInfoRuntime = overrides.worldInfoRuntime ?? worldInfoRuntime;
        const currentVisualState = overrides.visualState ?? visualState;
        const currentAuthorNote = overrides.authorNote ?? authorNote;
        const currentLastStateBlock = overrides.lastStateBlock ?? lastStateBlock;
        const currentSummaries = overrides.longTermSummaries ?? longTermSummaries;
        const currentPersona = overrides.persona ?? persona;

        const lastMessageContent = currentMessages.length > 0 
            ? currentMessages[currentMessages.length - 1].content 
            : '';

        const sessionToSave: ChatSession = {
            sessionId,
            characterFileName: card.fileName,
            presetName: preset.name,
            userPersonaId: currentPersona?.id || null,
            chatHistory: currentMessages,
            longTermSummaries: currentSummaries,
            authorNote: currentAuthorNote,
            worldInfoState: currentWorldInfoState,
            worldInfoPinned: currentWorldInfoPinned,
            worldInfoPlacement: currentWorldInfoPlacement,
            worldInfoRuntime: currentWorldInfoRuntime,
            variables: currentVariables,
            extensionSettings: currentExtensionSettings, // SAVE EXT SETTINGS
            lastStateBlock: currentLastStateBlock,
            visualState: currentVisualState,
            lastMessageSnippet: truncateText(lastMessageContent, 50),
            lastUpdated: Date.now(),
            initialDiagnosticLog, // Persist the existing initial log
        };

        try {
            await dbService.saveChatSession(sessionToSave);
        } catch (e) {
            console.error("Failed to save session:", e);
            // Optional: setError here if we want to notify user of save failure
        }
    }, [sessionId, card, preset, persona, messages, variables, extensionSettings, worldInfoState, worldInfoPinned, worldInfoPlacement, worldInfoRuntime, visualState, authorNote, lastStateBlock, longTermSummaries, initialDiagnosticLog]);

    return {
        // State
        messages, setMessages,
        variables, setVariables,
        extensionSettings, setExtensionSettings, // EXPOSE
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
        isLoading,
        error,
        // Actions
        saveSession
    };
};

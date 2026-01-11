
import { useEffect, useCallback, useRef } from 'react';
import type { ChatSession } from '../types';
import * as dbService from '../services/dbService';
import { useCharacter } from '../contexts/CharacterContext';
import { usePreset } from '../contexts/PresetContext';
import { useUserPersona } from '../contexts/UserPersonaContext';
import { mergeSettings } from '../services/settingsMerger';
import { truncateText } from '../utils';
import { useChatStore } from '../store/chatStore';

export const useChatSession = (sessionId: string | null) => {
    const {
        setSessionData,
        setError,
        setLoading,
        resetStore,
        // Lấy state từ store để theo dõi sự thay đổi
        messages,
        variables,
        worldInfoState,
        worldInfoRuntime,
        generatedLorebookEntries, // Track this
        isLoading
    } = useChatStore();

    // Contexts for resolution
    const { characters, isLoading: isCharLoading } = useCharacter();
    const { presets, isLoading: isPresetLoading } = usePreset();
    const { personas, isLoading: isPersonaLoading } = useUserPersona();

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Cờ kiểm tra xem dữ liệu đã được tải từ DB lên chưa.
    const isHydratedRef = useRef(false);

    // Hydration Logic (Blocking)
    useEffect(() => {
        // 1. Reset if no session
        if (!sessionId) {
            resetStore();
            setLoading(false);
            isHydratedRef.current = false;
            return;
        }

        // 2. Wait for dependencies (Contexts) to finish loading from DB
        if (isCharLoading || isPresetLoading || isPersonaLoading) {
            setLoading(true); 
            return;
        }

        const initializeSession = async () => {
            // Chỉ set loading true nếu chưa có dữ liệu (tránh flash loading khi re-render)
            if (!isHydratedRef.current) setLoading(true);
            setError(null);

            try {
                const session = await dbService.getChatSession(sessionId);
                if (!session) {
                    throw new Error("Không tìm thấy phiên trò chuyện trong Database.");
                }

                const sessionCardContext = characters.find(c => c.fileName === session.characterFileName);
                const sessionCard = sessionCardContext?.card;
                const sessionPreset = presets.find(p => p.name === session.presetName);
                const sessionPersona = personas.find(p => p.id === session.userPersonaId) || null;

                if (!sessionCard) {
                    throw new Error(`Không tìm thấy thẻ nhân vật: "${session.characterFileName}".`);
                }

                if (!sessionPreset) {
                    throw new Error(`Không tìm thấy Preset: "${session.presetName}".`);
                }

                // --- RPG STATE HYDRATION ---
                // Clone thẻ để tránh đột biến thẻ gốc trong Context
                // Nếu session có dữ liệu RPG đã lưu, dùng nó đè lên dữ liệu mặc định của thẻ
                const cardForSession = { ...sessionCard, fileName: session.characterFileName };
                if (session.rpgState) {
                    cardForSession.rpg_data = session.rpgState;
                }
                // ---------------------------

                // Hydrate Store (Atomic update)
                setSessionData({
                    sessionId,
                    card: cardForSession,
                    preset: sessionPreset,
                    persona: sessionPersona,
                    mergedSettings: mergeSettings(sessionCard, sessionPreset),
                    messages: session.chatHistory,
                    variables: session.variables || {},
                    extensionSettings: session.extensionSettings || {},
                    visualState: session.visualState || {},
                    authorNote: session.authorNote || '',
                    lastStateBlock: session.lastStateBlock || '',
                    longTermSummaries: session.longTermSummaries || [],
                    summaryQueue: session.summaryQueue || [],
                    worldInfoRuntime: session.worldInfoRuntime || {},
                    worldInfoPinned: session.worldInfoPinned || {},
                    worldInfoPlacement: session.worldInfoPlacement || {},
                    initialDiagnosticLog: session.initialDiagnosticLog || '',
                    generatedLorebookEntries: session.generatedLorebookEntries || [], // Hydrate generated entries
                });

                // Hydrate WI State
                let initialWorldInfoState: Record<string, boolean> = {};
                if (session.worldInfoState) {
                    initialWorldInfoState = session.worldInfoState;
                } else if (sessionCard.char_book?.entries) {
                    sessionCard.char_book.entries.forEach(entry => {
                        if (entry.uid) initialWorldInfoState[entry.uid] = entry.enabled !== false;
                    });
                }
                setSessionData({ worldInfoState: initialWorldInfoState });
                
                // Đánh dấu đã tải xong dữ liệu
                isHydratedRef.current = true;

            } catch (e) {
                console.error("Session load error:", e);
                setError(e instanceof Error ? e.message : 'Không thể tải phiên trò chuyện.');
            } finally {
                setLoading(false);
            }
        };

        // Chỉ chạy initialize nếu session ID thay đổi hoặc chưa hydrate
        if (!isHydratedRef.current || sessionId !== useChatStore.getState().sessionId) {
             initializeSession();
        }
       
    }, [
        sessionId, 
        isCharLoading, isPresetLoading, isPersonaLoading, 
        characters, presets, personas, 
        setSessionData, setError, setLoading, resetStore
    ]);


    // Auto-Save Logic (Manual Call)
    const saveSession = useCallback(async (overrides: Record<string, any> = {}) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            const state = useChatStore.getState();
            
            // Chỉ lưu khi đã có session ID và dữ liệu thẻ
            if (!state.sessionId || !state.card || !state.preset) return;

            const currentMessages = overrides.messages ?? state.messages;
            const lastMessageContent = currentMessages.length > 0 
                ? currentMessages[currentMessages.length - 1].content 
                : '';

            const sessionToSave: ChatSession = {
                sessionId: state.sessionId,
                characterFileName: state.card.fileName || state.card.name,
                presetName: overrides.preset?.name ?? state.preset.name,
                userPersonaId: state.persona?.id || null,
                
                chatHistory: currentMessages,
                longTermSummaries: overrides.longTermSummaries ?? state.longTermSummaries,
                summaryQueue: overrides.summaryQueue ?? state.summaryQueue,
                
                variables: overrides.variables ?? state.variables,
                extensionSettings: overrides.extensionSettings ?? state.extensionSettings,
                
                worldInfoState: overrides.worldInfoState ?? state.worldInfoState,
                worldInfoPinned: overrides.worldInfoPinned ?? state.worldInfoPinned,
                worldInfoPlacement: overrides.worldInfoPlacement ?? state.worldInfoPlacement,
                worldInfoRuntime: overrides.worldInfoRuntime ?? state.worldInfoRuntime,
                
                visualState: overrides.visualState ?? state.visualState,
                authorNote: overrides.authorNote ?? state.authorNote,
                lastStateBlock: overrides.lastStateBlock ?? state.lastStateBlock,
                
                // --- SAVE RPG STATE ---
                rpgState: state.card.rpg_data,
                // ---------------------

                // --- SAVE GENERATED LOREBOOK ---
                generatedLorebookEntries: state.generatedLorebookEntries,
                // ------------------------------

                lastMessageSnippet: truncateText(lastMessageContent, 50),
                lastUpdated: Date.now(),
                initialDiagnosticLog: state.initialDiagnosticLog,
            };

            try {
                await dbService.saveChatSession(sessionToSave);
                console.debug('[AutoSave] Saved session:', state.sessionId);
            } catch (e) {
                console.error("Failed to save session:", e);
            }
        }, 500); // Giảm delay xuống 500ms để phản hồi nhanh hơn
    }, []);

    // WATCHER: Tự động gọi saveSession khi dữ liệu quan trọng thay đổi
    useEffect(() => {
        // QUAN TRỌNG: Đã xóa điều kiện `isLoading` chặn lưu. 
        // Chúng ta muốn lưu ngay cả khi đang loading (để lưu tin nhắn User vừa gửi).
        if (!sessionId || !isHydratedRef.current) return;

        // Lưu khi có thay đổi quan trọng, bao gồm cả khi rpg_data thay đổi (thông qua setSessionData({ card }))
        // Vì useChatStore.getState().card thay đổi, và saveSession lấy state trực tiếp, nên nó sẽ bắt được.
        // Tuy nhiên, để useEffect này trigger khi card thay đổi, ta cần thêm dependency.
        saveSession();
    }, [
        messages, 
        variables, 
        worldInfoState, 
        worldInfoRuntime,
        generatedLorebookEntries, // Trigger save when links update
        useChatStore.getState().card, // Thêm dependency này để trigger khi Medusa update card
        saveSession
    ]);

    const changePreset = useCallback(async (presetName: string) => {
        const state = useChatStore.getState();
        if (!state.card) return;
        
        const newPreset = presets.find(p => p.name === presetName);
        if (!newPreset) return;

        setSessionData({
            preset: newPreset,
            mergedSettings: mergeSettings(state.card, newPreset)
        });

        const session = await dbService.getChatSession(state.sessionId!);
        if (session) {
            session.presetName = newPreset.name;
            await dbService.saveChatSession(session);
        }
        
        console.log(`[Session] Live Tuned to preset: ${newPreset.name}`);
    }, [presets, setSessionData]);

    return {
        saveSession,
        changePreset
    };
};

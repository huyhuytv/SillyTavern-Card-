
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { 
    ChatMessage, CharacterCard, SillyTavernPreset, UserPersona, 
    VisualState, WorldInfoRuntimeStats, SystemLogEntry, ChatTurnLog, 
    QuickReply, ScriptButton, SummaryQueueItem, WorldInfoEntry
} from '../types';

interface ChatState {
    sessionId: string | null;
    card: (CharacterCard & { fileName?: string }) | null;
    preset: SillyTavernPreset | null;
    persona: UserPersona | null;
    mergedSettings: SillyTavernPreset | null;
    
    messages: ChatMessage[];
    variables: Record<string, any>;
    extensionSettings: Record<string, any>;
    worldInfoRuntime: Record<string, WorldInfoRuntimeStats>;
    
    longTermSummaries: string[];
    summaryQueue: SummaryQueueItem[];
    worldInfoState: Record<string, boolean>;
    worldInfoPinned: Record<string, boolean>;
    worldInfoPlacement: Record<string, 'before' | 'after' | undefined>;
    authorNote: string;
    lastStateBlock: string;
    initialDiagnosticLog: string;

    // NEW: Persistent RPG Notification
    rpgNotification: string | null;
    // NEW: Generated Lorebook Entries
    generatedLorebookEntries: WorldInfoEntry[];

    visualState: VisualState;
    quickReplies: QuickReply[];
    scriptButtons: ScriptButton[];
    
    logs: {
        turns: ChatTurnLog[];
        systemLog: SystemLogEntry[];
        worldInfoLog: string[];
        smartScanLog: string[];
        mythicLog: string[];
    };
    
    isLoading: boolean;
    isSummarizing: boolean;
    isInputLocked: boolean;
    isAutoLooping: boolean;
    error: string | null;
    
    abortController: AbortController | null;
}

interface ChatActions {
    setSessionData: (data: Partial<ChatState>) => void;
    addMessage: (message: ChatMessage) => void;
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
    setMessages: (messages: ChatMessage[]) => void;
    setVariables: (vars: Record<string, any>) => void;
    
    addSystemLog: (log: SystemLogEntry) => void;
    addLogTurn: (turn: ChatTurnLog) => void;
    updateCurrentTurn: (updates: Partial<ChatTurnLog>) => void;
    addWorldInfoLog: (log: string) => void;
    addSmartScanLog: (log: string) => void;
    addMythicLog: (log: string) => void; 
    
    setLongTermSummaries: (summaries: string[]) => void;
    setSummaryQueue: (queue: SummaryQueueItem[]) => void;
    setLastStateBlock: (block: string) => void;
    
    setIsInputLocked: (locked: boolean) => void;
    setIsAutoLooping: (looping: boolean) => void;
    setQuickReplies: (replies: QuickReply[]) => void;
    setScriptButtons: (buttons: ScriptButton[]) => void;
    
    // NEW: Action to set RPG Notification
    setRpgNotification: (content: string | null) => void;
    // NEW: Set Generated Lorebook Entries
    setGeneratedLorebookEntries: (entries: WorldInfoEntry[]) => void;
    
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setAbortController: (ac: AbortController | null) => void;

    clearLogs: () => void;
    resetStore: () => void;

    updateRpgCell: (tableId: string, rowIndex: number, colIndex: number, value: any) => void;
    addRpgRow: (tableId: string) => void;
    deleteRpgRow: (tableId: string, rowIndex: number) => void;
}

const initialState: Omit<ChatState, 'abortController'> = {
    sessionId: null, card: null, preset: null, persona: null, mergedSettings: null,
    messages: [], variables: {}, extensionSettings: {}, worldInfoRuntime: {},
    longTermSummaries: [], summaryQueue: [], worldInfoState: {}, 
    worldInfoPinned: {}, worldInfoPlacement: {}, authorNote: '',
    lastStateBlock: '', initialDiagnosticLog: '', rpgNotification: null, generatedLorebookEntries: [],
    visualState: {}, quickReplies: [], scriptButtons: [],
    logs: { turns: [], systemLog: [], worldInfoLog: [], smartScanLog: [], mythicLog: [] },
    isLoading: false, isSummarizing: false, isInputLocked: false, isAutoLooping: false, error: null
};

export const useChatStore = create<ChatState & ChatActions>()(
    immer((set) => ({
        ...initialState,
        abortController: null,

        setSessionData: (data) => set((state) => { Object.assign(state, data); }),
        addMessage: (msg) => set((state) => { state.messages.push(msg); }),
        updateMessage: (id, updates) => set((state) => {
            const m = state.messages.find(msg => msg.id === id);
            if (m) Object.assign(m, updates);
        }),
        setMessages: (messages) => set((state) => { state.messages = messages; }),
        setVariables: (vars) => set((state) => { state.variables = vars; }),
        
        addSystemLog: (log) => set((state) => { 
            state.logs.systemLog.unshift(log);
            if (state.logs.systemLog.length > 200) state.logs.systemLog.pop();
        }),
        addLogTurn: (turn) => set((state) => { state.logs.turns.unshift(turn); }),
        updateCurrentTurn: (updates) => set((state) => {
            if (state.logs.turns.length > 0) {
                Object.assign(state.logs.turns[0], updates);
            }
        }),
        addWorldInfoLog: (log) => set((state) => { state.logs.worldInfoLog.unshift(log); }),
        addSmartScanLog: (log) => set((state) => { state.logs.smartScanLog.unshift(log); }),
        addMythicLog: (log) => set((state) => { state.logs.mythicLog.unshift(log); }),
        
        setLongTermSummaries: (summaries) => set((state) => { state.longTermSummaries = summaries; }),
        setSummaryQueue: (queue) => set((state) => { state.summaryQueue = queue; }),
        setLastStateBlock: (block) => set((state) => { state.lastStateBlock = block; }),
        
        setIsInputLocked: (locked) => set((state) => { state.isInputLocked = locked; }),
        setIsAutoLooping: (looping) => set((state) => { state.isAutoLooping = looping; }),
        setQuickReplies: (replies) => set((state) => { state.quickReplies = replies; }),
        setScriptButtons: (buttons) => set((state) => { state.scriptButtons = buttons; }),
        
        setRpgNotification: (content) => set((state) => { state.rpgNotification = content; }),
        setGeneratedLorebookEntries: (entries) => set((state) => { state.generatedLorebookEntries = entries; }),
        
        setLoading: (loading) => set((state) => { state.isLoading = loading; }),
        setError: (error) => set((state) => { state.error = error; }),
        setAbortController: (ac) => set((state) => { state.abortController = ac; }),

        clearLogs: () => set((state) => { state.logs = { turns: [], systemLog: [], worldInfoLog: [], smartScanLog: [], mythicLog: [] }; }),
        resetStore: () => set((state) => { Object.assign(state, initialState); state.abortController = null; }),

        updateRpgCell: (tableId, rowIndex, colIndex, value) => set((state) => {
            if (!state.card?.rpg_data) return;
            const table = state.card.rpg_data.tables.find(t => t.config.id === tableId);
            if (table && table.data.rows[rowIndex]) {
                table.data.rows[rowIndex][colIndex + 1] = value;
                state.card.rpg_data.lastUpdated = Date.now();
            }
        }),

        addRpgRow: (tableId) => set((state) => {
            if (!state.card?.rpg_data) return;
            const table = state.card.rpg_data.tables.find(t => t.config.id === tableId);
            if (table) {
                const newId = `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const newRow = new Array(table.config.columns.length + 1).fill("");
                newRow[0] = newId;
                table.data.rows.push(newRow);
                state.card.rpg_data.lastUpdated = Date.now();
            }
        }),

        deleteRpgRow: (tableId, rowIndex) => set((state) => {
            if (!state.card?.rpg_data) return;
            const table = state.card.rpg_data.tables.find(t => t.config.id === tableId);
            if (table) {
                table.data.rows.splice(rowIndex, 1);
                state.card.rpg_data.lastUpdated = Date.now();
            }
        }),
    }))
);

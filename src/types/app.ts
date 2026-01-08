
// --- RUNTIME STATE & UI TYPES ---

export interface PromptSection {
    id: string;
    name: string;
    content: string;
    role: string;
    subSections?: string[];
}

export interface SystemLogEntry {
    level: 'error' | 'warn' | 'script-error' | 'api-error' | 'script-success' | 'interaction' | 'api' | 'state' | 'log';
    source: 'iframe' | 'regex' | 'variable' | 'system' | 'console' | 'network' | 'script';
    message: string;
    timestamp: number;
    stack?: string;
    payload?: any;
}

export interface ChatTurnLog {
    timestamp: number;
    prompt: PromptSection[]; 
    response: string;
    summary?: string;
    systemLogs: SystemLogEntry[];
}

export interface QuickReply {
    label: string;
    message?: string;
    action?: string;
}

export interface ScriptButton {
    id: string;
    label: string;
    scriptId: string;
    eventId: string;
}

export interface SummaryQueueItem {
    id: string;
    status: 'pending' | 'processing' | 'failed';
    timestamp: number;
    error?: string;
}

export interface WorldInfoRuntimeStats {
    stickyDuration: number;
    cooldownDuration: number;
}

export interface VisualState {
    backgroundImage?: string;
    musicUrl?: string;
    ambientSoundUrl?: string;
    globalClass?: string;
}

// NEW: Trạng thái lỗi tương tác cho Modal
export interface InteractiveErrorState {
    hasError: boolean;
    title: string;
    message: string;
    errorDetails?: string;
    canIgnore: boolean;
}


export interface PromptEntry {
    name: string;
    content: string;
    enabled: boolean;
    role?: 'system' | 'user' | 'assistant';
    identifier?: string;
    include_title?: boolean;
    order?: number;
}

export interface SillyTavernPreset {
  name: string;
  comment: string;
  // Core Sampling
  temp: number | string;
  top_p: number | string;
  top_k: number | string;
  typical_p: number | string;
  // Advanced Sampling
  tfs: number | string;
  top_a: number | string;
  min_p: number | string;
  epsilon_cutoff: number | string;
  eta_ddim: number | string;
  // Repetition Penalty
  repetition_penalty: number | string;
  repetition_penalty_range: number | string;
  encoder_repetition_penalty: number | string;
  no_repeat_ngram_size: number | string;
  // Advanced Penalty
  frequency_penalty: number | string;
  presence_penalty: number | string;
  // Mirostat Sampling
  mirostat_mode: number;
  mirostat_tau: number | string;
  mirostat_eta: number | string;
  // Generation Control
  min_length: number | string;
  max_tokens: number | string; // Max new tokens
  n: number | string; // Number of generations
  do_sample: boolean;
  seed: number | string;
  ban_eos_token: boolean;
  add_bos_token: boolean;
  truncation_length: number | string;
  // Stopping Strings
  stopping_strings: string[];
  custom_stopping_strings: string[];
  // Instruct Mode
  system_prompt?: string;
  instruct_template?: string;
  // Prompts Array
  prompts?: PromptEntry[];
  
  // Newly added comprehensive fields
  // API and Model Settings
  chat_completion_source?: string; // 'custom', 'openrouter', 'proxy'
  openai_model?: string;
  claude_model?: string;
  openrouter_model?: string;
  proxy_model?: string; // NEW: Custom model ID for proxy (e.g. gemini-exp-1121)
  ai21_model?: string;
  mistralai_model?: string;
  cohere_model?: string;
  perplexity_model?: string;
  groq_model?: string;
  xai_model?: string;
  pollinations_model?: string;
  aimlapi_model?: string;
  electronhub_model?: string;
  moonshot_model?: string;
  fireworks_model?: string;
  cometapi_model?: string;
  custom_model?: string;
  google_model?: string;
  vertexai_model?: string;
  
  // Thinking Config (Experimental)
  thinking_budget?: number; // Ngân sách token cho suy nghĩ

  // TTS Settings (NEW)
  tts_enabled?: boolean;
  tts_provider?: 'gemini' | 'native'; // Provider
  tts_voice?: string; // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
  tts_native_voice?: string; // URI of native voice
  tts_rate?: number; // 0.1 to 10
  tts_pitch?: number; // 0 to 2

  // OpenRouter Settings
  openrouter_use_fallback?: boolean;
  openrouter_group_models?: boolean;
  openrouter_sort_models?: string;
  openrouter_providers?: string[];
  openrouter_allow_fallbacks?: boolean;
  openrouter_middleout?: string;

  // Smart World Info Scan Settings
  smart_scan_enabled?: boolean; // Deprecated but kept for compatibility check
  smart_scan_mode?: 'keyword' | 'hybrid' | 'ai_only'; // New Mode
  smart_scan_model?: string;
  smart_scan_depth?: number;
  smart_scan_max_entries?: number;
  smart_scan_system_prompt?: string; // NEW: Custom prompt for Smart Scan

  // NEW: Smart Context & Memory Settings
  context_depth?: number; // Độ sâu cửa sổ nhớ (số tin nhắn trước khi tóm tắt)
  summarization_chunk_size?: number; // Kích thước gói tóm tắt (số tin nhắn bị nén mỗi lần)
  context_mode?: 'standard' | 'ai_only'; // Chế độ ghép nối lịch sử
  summarization_prompt?: string; // Lời nhắc tóm tắt tùy chỉnh

  // Chat Behavior
  wrap_in_quotes?: boolean;
  names_behavior?: number;
  send_if_empty?: string;
  impersonation_prompt?: string;
  new_chat_prompt?: string;
  new_group_chat_prompt?: string;
  new_example_chat_prompt?: string;
  continue_nudge_prompt?: string;
  bias_preset_selected?: string;
  group_nudge_prompt?: string;
  assistant_prefill?: string;
  assistant_impersonation?: string;
  continue_postfix?: string;

  // Prompt Formatting
  wi_format?: string;
  scenario_format?: string;
  personality_format?: string;
  custom_prompt_post_processing?: string;
  
  // Miscellaneous
  max_context_unlocked?: boolean;
  stream_openai?: boolean;
  show_external_models?: boolean;
  claude_use_sysprompt?: boolean;
  use_makersuite_sysprompt?: boolean;
  vertexai_auth_mode?: string;
  squash_system_messages?: boolean;
  image_inlining?: boolean;
  inline_image_quality?: string;
  video_inlining?: boolean;
  bypass_status_check?: boolean;
  continue_prefill?: boolean;
  function_calling?: boolean;
  show_thoughts?: boolean;
  reasoning_effort?: string;
  enable_web_search?: boolean;
  request_images?: boolean;

  extensions?: Record<string, any>;

  // Allow any other properties that might exist in various presets
  [key: string]: any;
}

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

export interface WorldInfoEntry {
  id?: number;
  keys: string[];
  secondary_keys?: string[];
  comment?: string;
  content: string;
  constant?: boolean;
  selective?: boolean;
  insertion_order?: number;
  enabled?: boolean;
  position?: 'before_char' | 'after_char' | string;
  use_regex?: boolean;
  extensions?: Record<string, any>;
  sticky?: number;
  cooldown?: number;
  uid?: string;
  __deleted?: boolean;
  source_lorebook?: string;
}

export interface CharacterBook {
  entries: WorldInfoEntry[];
  name?: string;
}

export interface RegexScript {
  id: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings?: string[];
  placement?: number[];
  disabled: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
  runOnEdit?: boolean;
  substituteRegex?: number;
  minDepth?: number | null;
  maxDepth?: number | null;
}

export interface TavernHelperScript {
    type: 'script';
    value: {
        id: string;
        name: string;
        content: string;
        info?: string;
        buttons?: {name: string, visible: boolean}[];
        data?: Record<string, any>;
        enabled: boolean;
    };
}

export interface CharacterCard {
  name: string;
  description: string;
  personality?: string;
  first_mes: string;
  mes_example: string;
  scenario?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  alternate_greetings?: string[];
  char_book?: CharacterBook;
  extensions?: {
    TavernHelper_scripts?: TavernHelperScript[];
    regex_scripts?: RegexScript[];
    [key: string]: any;
  };
  creator_notes?: string;
  creatorcomment?: string;
  char_persona?: string;
  group_only_greetings?: string[];
  attached_lorebooks?: string[];
  data?: any;
  spec?: string;
  spec_version?: string;
  create_date?: string;
  avatar?: string;
  [key: string]: any;
}

export type EnhancementField = 'description' | 'personality' | 'first_mes' | 'mes_example';

export interface Lorebook {
    name: string;
    book: CharacterBook;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'model' | 'system';
    content: string;
    interactiveHtml?: string;
    originalRawContent?: string;
    contextState?: Record<string, any>;
    timestamp?: number;
}

export interface OpenRouterModel {
    id: string;
    name: string;
    description?: string;
    pricing: {
        prompt: string;
        completion: string;
    };
    context_length: number;
    architecture?: {
        modality?: string;
        tokenizer?: string;
        instruct_type?: string;
    };
    top_provider?: {
        max_completion_tokens?: number;
        is_moderated?: boolean;
    };
    per_request_limits?: any;
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

export interface UserPersona {
    id: string;
    name: string;
    description: string;
    avatar?: string;
}

export interface ChatSession {
    sessionId: string;
    characterFileName: string;
    presetName: string;
    userPersonaId: string | null;
    chatHistory: ChatMessage[];
    longTermSummaries: string[];
    variables: Record<string, any>;
    extensionSettings?: Record<string, any>;
    worldInfoState?: Record<string, boolean>;
    worldInfoPinned?: Record<string, boolean>;
    worldInfoPlacement?: Record<string, 'before' | 'after' | undefined>;
    worldInfoRuntime?: Record<string, WorldInfoRuntimeStats>;
    visualState?: VisualState;
    authorNote?: string;
    lastStateBlock?: string;
    lastMessageSnippet?: string;
    lastUpdated: number;
    initialDiagnosticLog?: string;
}

export interface AdventureSnapshot {
    version: number;
    timestamp: number;
    meta: {
        exportedBy: string;
        description: string;
    };
    data: {
        character: CharacterCard;
        characterFileName: string;
        preset: SillyTavernPreset;
        session: ChatSession;
        userPersona: UserPersona | null;
    };
}

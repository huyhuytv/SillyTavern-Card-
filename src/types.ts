
export interface SystemLogEntry {
    level: 'log' | 'warn' | 'error' | 'script-success' | 'script-error' | 'interaction' | 'api' | 'api-error' | 'state';
    source: 'system' | 'iframe' | 'regex' | 'variable' | 'api' | 'console' | 'network';
    message: string;
    timestamp: number;
    stack?: string;
    payload?: string;
}

export interface QuickReply {
    label: string;
    message?: string; // Nội dung gửi đi (mặc định giống label)
    action?: string; // Lệnh đặc biệt nếu có
}

// NEW: Definition for dynamic script buttons from TavernHelper/Cards
export interface ScriptButton {
    id: string; // Usually generated based on label or index
    label: string;
    scriptId: string; // ID of the script requesting the button
    eventId: string; // The event to emit when clicked
}

export interface UserPersona {
  id: string;
  name: string;
  description: string;
}

// ... (Keep existing interfaces: OpenRouterModel, ChatMessage, VisualState, WorldInfoRuntimeStats) ...

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  interactiveHtml?: string;
  originalRawContent?: string; // Store original pre-regex content for interactive cards
  contextState?: Record<string, any>; // NEW: Snapshot of variables at this point in time
}

export interface VisualState {
    backgroundImage?: string;
    musicUrl?: string;
    ambientSoundUrl?: string;
    globalClass?: string; // For applying CSS filters/effects to the whole screen
}

export interface WorldInfoRuntimeStats {
    stickyDuration: number; // Số lượt còn lại mục này sẽ "dính" trong context
    cooldownDuration: number; // Số lượt còn lại mục này bị chặn kích hoạt
}

export interface ChatSession {
  sessionId: string; // Unique ID, usually characterFileName
  characterFileName: string;
  presetName: string;
  userPersonaId: string | null;
  chatHistory: ChatMessage[];
  longTermSummaries: string[];
  authorNote?: string; // Ghi chú của tác giả, bền bỉ cho phiên này
  worldInfoState?: Record<string, boolean>; // Trạng thái bật/tắt thủ công (Manual override)
  worldInfoPinned?: Record<string, boolean>; // Trạng thái ghim thủ công (Manual pin)
  worldInfoPlacement?: Record<string, 'before' | 'after' | undefined>; // Vị trí thủ công (Manual placement override)
  worldInfoRuntime?: Record<string, WorldInfoRuntimeStats>; // Trạng thái động (Runtime state: sticky/cooldown)
  variables?: Record<string, any>; // Trạng thái biến động
  extensionSettings?: Record<string, any>; // NEW: Lưu trữ dữ liệu mở rộng của thẻ (inventory, status, achievements...)
  lastStateBlock?: string; // NEW: Last captured HTML state block for persistence
  visualState?: VisualState; // NEW: Persist visual/audio state
  lastMessageSnippet: string;
  lastUpdated: number; // timestamp
  initialDiagnosticLog?: string;
}

export interface WorldInfoEntry {
  id?: number; // V3 chara_card_v3 character_book
  keys: string[];
  secondary_keys?: string[]; // V3
  comment?: string; // V3
  content: string;
  constant?: boolean; // V3 - Luôn bật
  selective?: boolean; // V3
  insertion_order?: number; // V3
  enabled?: boolean; // V3, default is true
  position?: string; // V3
  use_regex?: boolean; // V3
  extensions?: Record<string, any>; // V3
  
  // Advanced Logic Properties
  sticky?: number; // Giữ trong context X lượt sau khi kích hoạt
  cooldown?: number; // Không kích hoạt lại trong Y lượt sau khi hết hiệu lực
  
  // Các trường dành riêng cho Studio để quản lý nâng cao
  source_lorebook?: string; // Theo dõi nguồn gốc của các mục được nhập
  uid?: string; // ID duy nhất cho việc render ổn định và quản lý trạng thái
  
  [key: string]: any; // Allows other fields
}

export interface CharacterBook {
  entries: WorldInfoEntry[];
  name?: string; // V3
  [key: string]: any; // Allows other book-level properties
}

// A standalone, manageable Lorebook file
export interface Lorebook {
  name: string; // Filename acts as the unique ID
  book: CharacterBook;
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
  [key: string]: any; // for other potential fields
}

export interface TavernHelperScriptButton {
    name: string;
    visible: boolean;
}

export interface TavernHelperScript {
    type: 'script';
    value: {
        id: string;
        name: string;
        content: string;
        info?: string;
        buttons?: TavernHelperScriptButton[];
        data?: Record<string, any>;
        enabled: boolean;
    };
}


export interface CharacterCard {
  spec?: string;
  spec_version?: string;
  name: string;
  description: string;
  personality?: string; // V3 has it in data
  first_mes: string;
  mes_example: string;
  scenario?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  alternate_greetings?: string[];
  group_only_greetings?: string[]; // New field
  
  // V3 specific fields that might appear at root or in data
  creatorcomment?: string;
  char_persona?: string;
  
  // World info can be char_book (older/internal) or character_book (V3)
  char_book?: CharacterBook;
  character_book?: CharacterBook; 

  attached_lorebooks?: string[]; // Array of attached lorebook names (IDs)
  
  extensions?: {
    talkativeness?: string;
    fav?: boolean;
    world?: string;
    depth_prompt?: {
      prompt: string;
      depth: number;
      role: string;
    };
    TavernHelper_scripts?: TavernHelperScript[];
    regex_scripts?: RegexScript[];
    tavern_helper?: any[]; // For the other format found in the card
    [key: string]: any;
  };
  
  // Allow any other string properties
  [key: string]: any;
}

export type EnhancementField = 'description' | 'personality' | 'first_mes' | 'mes_example';

// Added for Preset Editor
export interface PromptEntry {
  name: string;
  content: string;
  role: string;
  identifier: string;
  enabled?: boolean;
  system_prompt?: boolean;
  include_title?: boolean;
  [key: string]: any;
}

// NEW: Structured Prompt Section for Debugging
export interface PromptSection {
    id: string;
    name: string;
    content: string;
    role?: string; // 'system', 'user', 'model'
    subSections?: string[]; // NEW: For exploding large sections (like World Info) into lists in Debug UI
}

export interface SillyTavernPreset {
  name: string;
  comment: string;
  // Core Sampling - relaxed to allow strings for macros
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
  chat_completion_source?: string;
  openai_model?: string;
  claude_model?: string;
  openrouter_model?: string;
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

  // Allow any other properties that might exist in various presets
  [key: string]: any;
}

// Updated structure for logging
export interface ChatTurnLog {
    timestamp: number;
    prompt: PromptSection[]; // Changed from string[] to PromptSection[]
    response: string;
    summary?: string;
    systemLogs: SystemLogEntry[];
}

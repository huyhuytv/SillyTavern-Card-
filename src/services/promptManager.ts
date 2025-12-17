
import type { CharacterCard, SillyTavernPreset, Lorebook, WorldInfoEntry, ChatMessage, UserPersona, PromptSection } from '../types';
import ejs from 'ejs';
import { get, applyVariableOperation } from './variableEngine';

/**
 * Helper to filter active entries based on state and placement.
 */
const getActiveWorldInfoEntries = (
    card: CharacterCard, 
    worldInfoState?: Record<string, boolean>,
    activeEntriesOverride?: WorldInfoEntry[],
    worldInfoPlacement?: Record<string, 'before' | 'after' | undefined>
): { before: WorldInfoEntry[], after: WorldInfoEntry[] } => {
    let activeEntries: WorldInfoEntry[] = [];

    if (activeEntriesOverride) {
        activeEntries = [...activeEntriesOverride];
    } else {
        const allWorldEntries: WorldInfoEntry[] = [...(card.char_book?.entries || [])];
        activeEntries = allWorldEntries.filter(entry => {
            if (!entry.content || !entry.content.trim() || !entry.uid) return false;
            const isEnabledInCard = entry.enabled !== false;
            return worldInfoState ? (worldInfoState[entry.uid] ?? isEnabledInCard) : isEnabledInCard;
        });
    }

    activeEntries.sort((a, b) => (a.insertion_order || 0) - (b.insertion_order || 0));
    
    const entriesBefore: WorldInfoEntry[] = [];
    const entriesAfter: WorldInfoEntry[] = [];

    activeEntries.forEach(entry => {
        const override = entry.uid && worldInfoPlacement ? worldInfoPlacement[entry.uid] : undefined;
        if (override === 'before') { entriesBefore.push(entry); return; }
        if (override === 'after') { entriesAfter.push(entry); return; }

        const pos = (entry.position || '').toLowerCase();
        if (pos.includes('after')) { entriesAfter.push(entry); } 
        else { entriesBefore.push(entry); }
    });

    return { before: entriesBefore, after: entriesAfter };
};

/**
 * Processes a string through the EJS engine with RECURSIVE support.
 */
const processEjsTemplate = async (
    template: string, 
    variables: Record<string, any>,
    card: CharacterCard,
    lorebooks: Lorebook[],
    depth: number = 0
): Promise<string> => {
    // Safety brake for recursion
    if (depth > 5) return ""; 
    
    if (!template) return '';

    // 1. Strip SillyTavern specific directives logic markers (aggressive cleanup)
    let cleanTemplate = template
        .replace(/^@@[a-z_]+.*$/gm, '') // Remove lines starting with @@
        .replace(/^\s*#.*$/gm, ''); // Remove lines starting with # (sometimes used for comments in WI)

    // If no EJS tags, return immediately (Macro replacement happens later)
    if (!cleanTemplate.includes('<%')) return cleanTemplate;

    // Helper to access variables safely
    const getvar = (path: string) => get(variables, path);

    // RECURSIVE getwi function
    // Supports polymorphism: getwi(key) OR getwi(book, key)
    const getwi = async (arg1: string | null, arg2?: string) => {
        // Normalize arguments
        let bookName: string | null = null;
        let entryKey: string = '';

        if (arg2 === undefined) {
            // Case: getwi('Key') -> arg1 is Key
            if (arg1) entryKey = arg1;
        } else {
            // Case: getwi('Book', 'Key') or getwi(null, 'Key')
            bookName = arg1;
            entryKey = arg2;
        }

        // console.log(`[EJS] getwi called. Book: ${bookName}, Key: ${entryKey}`);

        let allEntries: WorldInfoEntry[] = [];
        if (card.char_book?.entries) allEntries = [...allEntries, ...card.char_book.entries];
        lorebooks.forEach(lb => { 
            // Filter by bookName if provided
            if (bookName && lb.name !== bookName) return;
            if (lb.book?.entries) allEntries = [...allEntries, ...lb.book.entries]; 
        });

        const entry = allEntries.find(e => {
            // Robust matching: Check exact comment match OR key inclusion, case-insensitive if needed
            const commentMatch = e.comment && e.comment.trim() === entryKey;
            const keyMatch = e.keys && e.keys.includes(entryKey); 
            return commentMatch || keyMatch;
        });

        if (!entry) {
            // Silently fail or log warning based on preference. 
            // For complex cards, silent failure on optional WI is often preferred to avoid error spam.
            // console.warn(`[EJS] getwi failed: Entry '${entryKey}' not found.`);
            return '';
        }

        // CRITICAL: Recursively render the content of the found entry
        return await processEjsTemplate(entry.content, variables, card, lorebooks, depth + 1);
    };

    try {
        // Render using EJS
        // CRITICAL FIX: Inject `stat_data` pointing to variables so V3 scripts accessing stat_data directly work.
        const context = { 
            getvar, 
            getwi, 
            char: card.name, 
            stat_data: variables, // Inject alias for V3 compatibility
            ...variables 
        };

        const rendered = await ejs.render(
            cleanTemplate, 
            context, 
            { async: true, rmWhitespace: true }
        );
        
        return rendered;
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`EJS Rendering Error (Depth ${depth}):`, errorMsg);
        // Return an error string so the user knows logic failed, rather than silently swallowing it
        return `[SYSTEM ERROR: EJS Processing Failed - ${errorMsg}]`; 
    }
};

/**
 * HELPER: Scans rendered text for lines that are actually Keys to other WI entries.
 * If found, replaces the key with that entry's content.
 * Solves the issue where Event Controllers output "Event_ID" and expect the system to fetch the event description.
 */
const expandKeysToContent = async (
    text: string, 
    variables: Record<string, any>,
    card: CharacterCard,
    lorebooks: Lorebook[]
): Promise<string> => {
    if (!text || !text.trim()) return text;

    const lines = text.split('\n');
    const processedLines = await Promise.all(lines.map(async (line) => {
        const cleanLine = line.trim();
        if (!cleanLine) return line;

        // Gather all available entries
        let allEntries: WorldInfoEntry[] = [];
        if (card.char_book?.entries) allEntries = [...allEntries, ...card.char_book.entries];
        lorebooks.forEach(lb => { if (lb.book?.entries) allEntries = [...allEntries, ...lb.book.entries]; });

        // Check if this line exactly matches a Key or Comment of another entry
        const matchedEntry = allEntries.find(e => {
            const isKeyMatch = e.keys && e.keys.includes(cleanLine);
            const isCommentMatch = e.comment && e.comment === cleanLine;
            return (isKeyMatch || isCommentMatch) && !e.constant; // Don't expand constants to avoid infinite loops if they refer to themselves
        });

        if (matchedEntry) {
            // Found a match! Recursively render its content.
            // console.log(`[PromptManager] Auto-expanding key: "${cleanLine}" -> Entry Content`);
            return await processEjsTemplate(matchedEntry.content, variables, card, lorebooks);
        }

        return line;
    }));

    return processedLines.join('\n');
};

/**
 * CLEANS technical/mechanical content from a message string.
 * Removes: <thinking>, <UpdateVariable>, [CHOICE], StatusPlaceholders, and Code Blocks.
 */
export const cleanMessageContent = (text: string): string => {
    if (!text) return '';
    return text
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '') // Remove Thinking blocks
        .replace(/<UpdateVariable(?:variable)?>[\s\S]*?<\/UpdateVariable(?:variable)?>/gi, '') // Remove Variable scripts
        .replace(/<LogicStore>[\s\S]*?<\/LogicStore>/gi, '') // Remove LogicStore
        .replace(/<VisualInterface>[\s\S]*?<\/VisualInterface>/gi, '') // Remove VisualInterface
        .replace(/<StatusPlaceHolderImpl\s*\/?>/gi, '') // Remove Status Bar placeholders
        .replace(/\[CHOICE:.*?\]/g, '') // Remove Choices
        .replace(/```[\s\S]*?```/g, '') // Remove Code blocks (mechanics/status)
        .replace(/\n\s*\n/g, '\n') // Collapse extra newlines
        .trim();
};

/**
 * Prepares the basic structure of prompt sections.
 * Note: We NO LONGER inject World Info strings here. We just identify where they go.
 */
export function prepareChat(
    card: CharacterCard, 
    preset: SillyTavernPreset, 
    lorebooks: Lorebook[], 
    persona: UserPersona | null, 
    worldInfoState?: Record<string, boolean>,
    activeEntries?: WorldInfoEntry[],
    worldInfoPlacement?: Record<string, 'before' | 'after' | undefined>
): { baseSections: PromptSection[] } {
    
    // We perform the sorting/filtering here to ensure consistent state
    // But we won't render the content until constructChatPrompt
    
    const sections: PromptSection[] = (preset.prompts || [])
        .filter(p => p.enabled === true && p.content)
        .map((p, index) => {
            return {
                id: p.identifier || `prompt_${index}`,
                name: p.name || 'Untitled Prompt',
                content: p.content, 
                role: p.role || 'system',
                // subSections will be populated later
            };
        });

    return { baseSections: sections };
}

/**
 * Constructs the full prompt string AND the structured sections.
 * Executes EJS logic for both Prompt Templates and World Info entries.
 */
export async function constructChatPrompt(
    baseSections: PromptSection[], 
    fullHistoryForThisTurn: ChatMessage[],
    authorNote: string,
    card: CharacterCard, 
    longTermSummaries: string[],
    pageSize: number, 
    variables: Record<string, any>,
    lastStateBlock: string, 
    lorebooks: Lorebook[] = [],
    contextMode: 'standard' | 'ai_only' = 'standard',
    userPersonaName: string = 'User',
    // Pass these to re-calculate WI inside async context
    worldInfoState?: Record<string, boolean>,
    activeEntriesOverride?: WorldInfoEntry[],
    worldInfoPlacement?: Record<string, 'before' | 'after' | undefined>,
    preset?: SillyTavernPreset
): Promise<{ fullPrompt: string, structuredPrompt: PromptSection[] }> {

    if (fullHistoryForThisTurn.length === 0) {
        throw new Error("Không thể tạo phản hồi cho một lịch sử trống.");
    }

    const history = fullHistoryForThisTurn.slice(0, -1);
    const userInput = fullHistoryForThisTurn[fullHistoryForThisTurn.length - 1].content;
    
    const allDefinitions = [
        card.description,
        card.personality,
        card.scenario,
        card.mes_example,
    ].filter(Boolean).join('\n\n');

    // --- 1. Process World Info (Render -> Filter -> Format) ---
    // IMPORTANT: World Info must be processed BEFORE variables formatting.
    // Why? Because some World Info entries (like Preprocessing scripts) might EXECUTE code that updates variables.
    // If we format variables first, we send stale data to the AI.
    
    const { before, after } = getActiveWorldInfoEntries(card, worldInfoState, activeEntriesOverride, worldInfoPlacement);
    const wiFormat = preset?.wi_format || '[{{keys}}: {{content}}]';

    const processEntryList = async (entries: WorldInfoEntry[]): Promise<string[]> => {
        const results: string[] = [];
        for (const entry of entries) {
            // A. Render EJS first (Execute logic)
            // This step might update 'variables' via side effects if the entry contains scripts
            let renderedContent = await processEjsTemplate(entry.content, variables, card, lorebooks);
            
            // B. Auto-Expansion: If content is just an Event ID, fetch the real event content
            renderedContent = await expandKeysToContent(renderedContent, variables, card, lorebooks);

            // C. Filter: If result is empty/whitespace, discard it (Logic Controller)
            // UNLESS it is an error message we want to show for debugging
            if (!renderedContent || (!renderedContent.trim() && !renderedContent.includes('[SYSTEM ERROR'))) continue;

            // D. Format: Apply the display format (e.g. [Key: Value])
            const formatted = wiFormat
                .replace(/{{keys}}/g, (entry.keys || []).join(', '))
                .replace(/{{content}}/g, renderedContent.trim());
            
            results.push(formatted);
        }
        return results;
    };

    // Processing WI lists triggers any scripts within them (like @@preprocessing)
    const worldInfoBeforeList = await processEntryList(before);
    const worldInfoAfterList = await processEntryList(after);
    const worldInfoCombinedList = [...worldInfoBeforeList, ...worldInfoAfterList];

    const worldInfoBeforeString = worldInfoBeforeList.join('\n');
    const worldInfoAfterString = worldInfoAfterList.join('\n');
    const worldInfoCombinedString = worldInfoCombinedList.join('\n');

    // --- 2. Prepare Prompt Variables (MOVED AFTER WI PROCESSING) ---
    // Now that WI scripts have run, the 'variables' object is up-to-date.
    
    const formatVariablesForPrompt = (vars: Record<string, any>): string => {
        if (!vars || Object.keys(vars).length === 0) return '';
        const leanVars: Record<string, any> = {};
        function processObject(source: any, target: any) {
            for (const key in source) {
                if (key === '$meta') continue;
                const value = source[key];
                if (Array.isArray(value) && value.length > 1 && typeof value[1] === 'string') {
                    let mainValue = value[0];
                    if (Array.isArray(mainValue)) {
                        target[key] = mainValue.filter((item: any) => item !== '$__META_EXTENSIBLE__$');
                    } else {
                        target[key] = [mainValue];
                    }
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    target[key] = {};
                    processObject(value, target[key]);
                } else {
                    target[key] = value;
                }
            }
        }
        processObject(vars, leanVars);
        if (Object.keys(leanVars).length === 0) return '';
        return JSON.stringify(leanVars, null, 2);
    };

    const variablesStateString = formatVariablesForPrompt(variables);

    let smartStateString = '';
    if (variablesStateString && lastStateBlock) {
        smartStateString = `<LogicStore>\n${variablesStateString}\n</LogicStore>\n\n<VisualInterface>\n${lastStateBlock}\n</VisualInterface>`;
    } else if (variablesStateString) {
        smartStateString = `<LogicStore>\n${variablesStateString}\n</LogicStore>`;
    } else if (lastStateBlock) {
        smartStateString = `<VisualInterface>\n${lastStateBlock}\n</VisualInterface>`;
    }

    // --- 3. Prepare Context Strings & Lists ---
    
    // Tầng 3: Trí nhớ Dài hạn
    const longTermSummaryString = longTermSummaries.length > 0 
        ? `${longTermSummaries.join('\n\n---\n\n')}`
        : "Đây là khởi đầu của cuộc trò chuyện.";

    const totalMessagesInSummaries = longTermSummaries.length * pageSize;
    let currentPageMessages = history.slice(totalMessagesInSummaries);
    
    if (contextMode === 'ai_only') {
        currentPageMessages = currentPageMessages.filter(msg => msg.role === 'model' || msg.role === 'system');
    }

    const replaceHistoryMacros = (text: string) => {
        return text.replace(/{{user}}/gi, userPersonaName).replace(/{{char}}/gi, card.name);
    };

    // HELPER: Get meaningful text content (fallback to raw if display is empty)
    const getMessageContent = (msg: ChatMessage) => {
        if (msg.content && msg.content.trim()) return msg.content;
        // Fallback for interactive cards where content is empty but originalRawContent exists
        return msg.originalRawContent || '';
    };

    // Tầng 2: Trí nhớ Ngắn hạn (Lịch sử trang này)
    const currentPageHistoryList = currentPageMessages.map(msg => {
        // Get content
        const rawText = getMessageContent(msg);
        // Apply cleaning specifically for history injection
        const cleanText = cleanMessageContent(rawText);
        // Apply macros
        const content = replaceHistoryMacros(cleanText);
        
        if (!content.trim()) return null; // Skip empty lines after cleaning

        if (msg.role === 'user') return `${userPersonaName}: ${content}`;
        if (msg.role === 'system') return `System: ${content}`;
        return `${card.name}: ${content}`;
    }).filter(Boolean) as string[];
    
    if (currentPageHistoryList.length === 0) {
        currentPageHistoryList.push(contextMode === 'ai_only' ? "Bắt đầu phần tự thuật mới." : "Bắt đầu trang hội thoại mới.");
    }
    const currentPageHistoryString = currentPageHistoryList.join('\n');

    // Tầng 1: Ngữ cảnh Tức thời (Lượt gần nhất)
    const lastTurnList: string[] = [];
    
    // FIXED: Use full 'history' (everything before current input) instead of 'currentPageMessages'
    // to ensure {{last_turn}} always has content even if context window is full/summarized.
    const contextForLastTurn = history; 

    if (contextForLastTurn.length > 0) {
        // Simplified logic to get the most recent exchange
        const lastUserIndex = contextForLastTurn.map(m => m.role).lastIndexOf('user');
        // If user found, take from there. If not, just take last 2.
        const relevantMsgs = lastUserIndex !== -1 
            ? contextForLastTurn.slice(lastUserIndex) 
            : contextForLastTurn.slice(-2);
        
        relevantMsgs.forEach(msg => {
             const rawText = getMessageContent(msg);
             
             // --- RAW CONTENT MODIFICATION ---
             // We DO NOT clean the last turn content.
             // This preserves <thinking>, <UpdateVariable>, HTML, and Chain of Thought for the AI to see.
             // This consumes more tokens but allows CoT continuation and logic retention.
             const content = replaceHistoryMacros(rawText);
             
             if (content.trim()) {
                 const role = msg.role === 'user' ? userPersonaName : card.name;
                 lastTurnList.push(`${role}: ${content}`);
             }
        });
    } else {
        lastTurnList.push("Chưa có lượt nào gần đây.");
    }
    const lastTurnString = lastTurnList.join('\n');
    
    // --- 4. Assemble & Render Prompt Sections ---
    
    const resolvedSections: PromptSection[] = [];
    
    // Use SEQUENTIAL LOOP to ensure variable updates propagate correctly between prompts
    for (const section of baseSections) {
        let content = section.content;
        
        // Inject Lists into subSections if macros present (for Debug Panel visualization)
        let subSections: string[] | undefined = undefined;
        const addToSubSections = (list: string[]) => {
            if (!subSections) subSections = [];
            subSections.push(...list);
        };

        if (content.includes('{{worldInfo_before}}')) addToSubSections(worldInfoBeforeList);
        if (content.includes('{{worldInfo_after}}')) addToSubSections(worldInfoAfterList);
        if (content.includes('{{worldInfo}}')) addToSubSections(worldInfoCombinedList);
        
        if (content.includes('{{long_term_summary}}')) addToSubSections(longTermSummaries.length > 0 ? longTermSummaries : ["Chưa có tóm tắt dài hạn."]);
        if (content.includes('{{current_page_history}}')) addToSubSections(currentPageHistoryList);
        if (content.includes('{{last_turn}}')) addToSubSections(lastTurnList);

        // Macro Replacement - Order Matters: Randoms -> Vars SET -> Vars GET -> Text
        
        // 1. RANDOM/ROLL (Highest Priority for nested macros inside variables)
        const rollHandler = (_: string, countStr: string, sidesStr: string, modStr: string) => {
            const count = countStr ? parseInt(countStr, 10) : 1; 
            const sides = parseInt(sidesStr, 10);
            let total = 0;
            for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
            if (modStr) total += parseInt(modStr.replace(/\s/g, ''), 10);
            return String(total);
        };
        content = content.replace(/{{dice:(\s*\d*)d(\d+)\s*([+-]\s*\d+)?\s*}}/gi, rollHandler)
                         .replace(/{{roll:(\s*\d*)d(\d+)\s*([+-]\s*\d+)?\s*}}/gi, rollHandler)
                         .replace(/{{random:(.*?)}}/gi, (_, c) => {
                             const args = c.split(',');
                             return args[Math.floor(Math.random() * args.length)].trim();
                         });

        // 2. VARIABLES SETTERS (CRITICAL: Prioritize SET before GET to propagate state)
        // We update the local 'variables' reference so subsequent replacement logic sees the new value.
        
        content = content.replace(/{{setglobalvar::([^:]+)::(.*?)}}/gi, (_, key, val) => {
            variables = applyVariableOperation(variables, 'set', 'globals.' + key, val);
            return ''; 
        });

        content = content.replace(/{{setvar::([^:]+)::(.*?)}}/gi, (_, key, val) => {
            variables = applyVariableOperation(variables, 'set', key, val);
            return ''; 
        });

        // 3. VARIABLES GETTERS
        content = content.replace(/{{getvar::([^}]+)}}/gi, (_, path) => {
            const val = get(variables, path);
            return val !== undefined ? String(val) : '';
        });
        
        content = content.replace(/{{getglobalvar::([^}]+)}}/gi, (_, key) => {
            const val = get(variables, 'globals.' + key);
            return val !== undefined ? String(val) : '';
        });

        // 4. STANDARD REPLACEMENTS
        content = content
            .replace(/{{worldInfo_before}}/g, worldInfoBeforeString)
            .replace(/{{worldInfo_after}}/g, worldInfoAfterString)
            .replace(/{{worldInfo}}/g, worldInfoCombinedString)
            .replace(/{{char}}/g, card.name || '')
            .replace(/{{user}}/g, userPersonaName)
            .replace(/<user>/g, userPersonaName)
            .replace(/{{smart_state_block}}/g, smartStateString)
            .replace(/{{current_variables_state}}/g, variablesStateString)
            .replace(/{{last_state}}/g, lastStateBlock)
            .replace(/{{author_note}}/g, authorNote || '')
            .replace(/{{long_term_summary}}/g, longTermSummaryString)
            .replace(/{{current_page_history}}/g, currentPageHistoryString)
            .replace(/{{last_turn}}/g, lastTurnString)
            .replace(/{{user_input}}/g, userInput)
            .replace(/{{prompt}}/g, userInput)
            .replace(/{{get_message_variable::([^}]+)}}/gi, (_, path) => {
                const val = get(variables, path);
                if (val === undefined) return '';
                return typeof val === 'object' ? JSON.stringify(val) : String(val);
            })
            .replace(/{{all_definitions}}/g, allDefinitions)
            .replace(/{{description}}/g, card.description)
            .replace(/{{personality}}/g, card.personality)
            .replace(/{{scenario}}/g, card.scenario)
            .replace(/{{mes_example}}/g, card.mes_example);

        // Async EJS Processing for the section itself
        content = await processEjsTemplate(content, variables, card, lorebooks);
        content = content.trim();
        
        if (content) {
            resolvedSections.push({ ...section, content, subSections });
        }
    }

    const fullPrompt = resolvedSections.map(s => s.content).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    
    return { fullPrompt, structuredPrompt: resolvedSections };
}

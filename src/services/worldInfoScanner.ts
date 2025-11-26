
import type { WorldInfoEntry, WorldInfoRuntimeStats } from '../types';

/**
 * Converts a pattern string into a RegExp object.
 * Supports SillyTavern style "/pattern/flags" (e.g., "/hero/i") or raw strings.
 * Defaults to case-insensitive ('i') if no flags provided for raw strings.
 */
const stringToRegex = (pattern: string): RegExp | null => {
    if (!pattern) return null;
    try {
        // Check for /pattern/flags syntax
        const match = pattern.match(/^\/(.*?)\/([gimsuy]*)$/);
        if (match) {
            return new RegExp(match[1], match[2]);
        }
        // Default behavior for raw strings in Regex mode: Case insensitive
        return new RegExp(pattern, 'i');
    } catch (e) {
        console.warn(`[WorldInfoScanner] Invalid Regex: ${pattern}`, e);
        return null;
    }
};

/**
 * Checks if a single key matches the text.
 * Handles both Regex mode and Standard Keyword logic (AND '&', NOT '!').
 */
const checkKeyMatch = (key: string, text: string, useRegex: boolean): boolean => {
    if (!key || !text) return false;

    if (useRegex) {
        const regex = stringToRegex(key);
        if (!regex) return false;
        return regex.test(text);
    } else {
        // Standard Keyword Logic
        // Example: "dragon & fire & !ice"
        // Meaning: Must contain "dragon", must contain "fire", must NOT contain "ice"
        const parts = key.split('&').map(k => k.trim());
        const textLower = text.toLowerCase();

        for (const part of parts) {
            if (!part) continue;
            
            if (part.startsWith('!')) {
                // NOT logic: If text contains the forbidden word, fail immediately
                const negativeKeyword = part.substring(1).trim().toLowerCase();
                if (negativeKeyword && textLower.includes(negativeKeyword)) {
                    return false;
                }
            } else {
                // AND logic: If text does NOT contain the required word, fail immediately
                const positiveKeyword = part.toLowerCase();
                if (positiveKeyword && !textLower.includes(positiveKeyword)) {
                    return false; 
                }
            }
        }
        // If we passed all checks for this key string, it's a match
        return true;
    }
};

/**
 * Scans text against a list of World Info entries.
 * Implements V3 Logic:
 * 1. Check Constant/Enabled/Cooldown.
 * 2. Primary Keys: OR logic (at least one must match).
 * 3. Secondary Keys: If present, OR logic (at least one must match).
 * 4. Result = Primary Match AND (Secondary Keys Empty OR Secondary Match).
 */
const scanEntries = (
    text: string, 
    entries: WorldInfoEntry[], 
    manualState: Record<string, boolean> = {},
    runtimeState: Record<string, WorldInfoRuntimeStats> = {}
): WorldInfoEntry[] => {
    const matchedEntries: WorldInfoEntry[] = [];

    for (const entry of entries) {
        if (!entry.uid) continue;
        
        // 1. Check Manual Toggle (Hard Override)
        // If explicitly disabled by user, skip. Default is enabled.
        const isManuallyEnabled = manualState[entry.uid] !== false;
        if (!isManuallyEnabled) continue;

        // 2. Check Runtime Cooldown
        const stats = runtimeState[entry.uid] || { stickyDuration: 0, cooldownDuration: 0 };
        if (stats.cooldownDuration > 0) continue;

        // 3. Constant entries always match immediately
        if (entry.constant) {
            matchedEntries.push(entry);
            continue;
        }

        // 4. Check Primary Keys (At least one must match)
        const hasPrimaryKeys = entry.keys && entry.keys.length > 0;
        if (!hasPrimaryKeys) continue; // No keys = no trigger (unless constant, handled above)

        let primaryMatch = false;
        for (const keyStr of entry.keys) {
            if (checkKeyMatch(keyStr, text, !!entry.use_regex)) {
                primaryMatch = true;
                break; // Optimization: One match is enough to satisfy OR logic
            }
        }

        if (!primaryMatch) continue; // Primary condition failed, skip entry

        // 5. Check Secondary Keys (Filter)
        // If secondary keys exist, at least one MUST match. If empty, condition is ignored (true).
        const hasSecondaryKeys = entry.secondary_keys && entry.secondary_keys.length > 0;
        let secondaryMatch = true; // Default to true if no secondary keys exist

        if (hasSecondaryKeys) {
            secondaryMatch = false; // Reset to false, now we must find a match
            for (const keyStr of entry.secondary_keys!) {
                if (checkKeyMatch(keyStr, text, !!entry.use_regex)) {
                    secondaryMatch = true;
                    break;
                }
            }
        }

        // 6. Final Decision
        if (secondaryMatch) {
            matchedEntries.push(entry);
        }
    }

    return matchedEntries;
};

/**
 * Helper to prepare lorebook data payload for AI Smart Scan.
 * Truncates content to 300 chars start + 100 chars end.
 * Splits into 'contextString' (Constants) and 'candidateString' (Candidates).
 */
export const prepareLorebookForAI = (entries: WorldInfoEntry[]): { contextString: string, candidateString: string } => {
    const contextParts: string[] = [];
    const candidateParts: string[] = [];

    entries.forEach(entry => {
        if (!entry.uid || entry.enabled === false) return; // Skip only if manually disabled

        let content = entry.content || '';
        if (content.length > 400) {
            content = content.slice(0, 300) + "\n... (đã lược bỏ) ...\n" + content.slice(-100);
        }
        // Escape newlines for JSON-like text structure to keep prompt clean
        content = content.replace(/\n/g, ' ');
        
        const formattedEntry = `[${entry.constant ? 'Hằng số/Kiến thức nền' : 'ID: ' + entry.uid}]
- Tên: ${entry.comment || 'Không tên'}
- Từ khóa: ${(entry.keys || []).join(', ')}
- Nội dung: "${content}"`;

        if (entry.constant) {
            contextParts.push(formattedEntry);
        } else {
            candidateParts.push(formattedEntry);
        }
    });

    return {
        contextString: contextParts.join('\n\n'),
        candidateString: candidateParts.join('\n\n')
    };
};

/**
 * Main Recursive Scanner
 * 
 * Strategy:
 * 1. Scan 'textToScan' (User Input + Recent History).
 * 2. Collect matched entries.
 * 3. Concatenate content of matched entries.
 * 4. Recursively scan that content for *new* entries.
 * 5. Repeat until max depth or no new entries found.
 * 
 * @param bypassKeywordScan If true (AI Only mode), skips keyword checks and only processes constants + AI Active UIDs.
 */
export const performWorldInfoScan = (
    textToScan: string,
    allEntries: WorldInfoEntry[],
    manualState: Record<string, boolean>,
    currentRuntimeState: Record<string, WorldInfoRuntimeStats>,
    pinnedState: Record<string, boolean> = {},
    aiActiveUids: string[] = [], // New: Accept IDs found by AI
    bypassKeywordScan: boolean = false // NEW: Flag for AI Only Mode
): { activeEntries: WorldInfoEntry[]; updatedRuntimeState: Record<string, WorldInfoRuntimeStats> } => {
    
    const MAX_DEPTH = 2; // Prevent infinite loops (A triggers B, B triggers A)
    let currentDepth = 0;
    
    // Set of UIDs that are active for this turn
    const activeUidSet = new Set<string>();
    
    // 1. Initial Scan Setup
    
    // A. Identify "Constant" entries (Always active regardless of mode, unless manually disabled)
    const constantEntries = allEntries.filter(e => e.constant && manualState[e.uid!] !== false);
    constantEntries.forEach(e => activeUidSet.add(e.uid!));
    
    // B. Identify "Pinned" entries (Always active regardless of mode, unless manually disabled)
    const pinnedEntries = allEntries.filter(e => e.uid && pinnedState[e.uid] && manualState[e.uid!] !== false);
    pinnedEntries.forEach(e => activeUidSet.add(e.uid!));

    // C. Identify "Sticky" entries (Active from previous turns)
    for (const uid in currentRuntimeState) {
        if (currentRuntimeState[uid].stickyDuration > 0) {
            activeUidSet.add(uid);
        }
    }
    
    // D. AI-Activated Entries (Option B: AI Overrides Cooldown)
    // Treat them like they are forcefully inserted.
    aiActiveUids.forEach(uid => {
        if (!activeUidSet.has(uid)) {
            const entry = allEntries.find(e => e.uid === uid);
            if (entry) {
                 // Check ONLY Manual Disable. IGNORE Cooldowns for AI Selections.
                 const isManuallyEnabled = manualState[uid] !== false;
                 if (isManuallyEnabled) {
                     activeUidSet.add(uid);
                 }
            }
        }
    });

    // E. Keyword Scan (Skip if bypassKeywordScan is true - AI Only Mode)
    if (!bypassKeywordScan) {
        let textBuffer = textToScan;
        
        // Start Recursive Loop (Scanning content of activated entries for *more* entries)
        while (currentDepth <= MAX_DEPTH) {
            const newlyFound = scanEntries(textBuffer, allEntries, manualState, currentRuntimeState);
            let hasNew = false;
            let newContent = '';

            for (const entry of newlyFound) {
                if (!entry.uid) continue;
                if (!activeUidSet.has(entry.uid)) {
                    activeUidSet.add(entry.uid);
                    hasNew = true;
                    // Append content for recursive scanning
                    newContent += '\n' + entry.content;
                }
            }

            if (!hasNew) break; // Stop if no new entries were found in this pass

            // Update buffer for next recursion: scan the content of the entries we just found.
            textBuffer = newContent;
            currentDepth++;
        }
    }

    // 2. Update Runtime State (Counters)
    const nextRuntimeState: Record<string, WorldInfoRuntimeStats> = {};

    // Initialize next state based on current state (decrementing counters)
    for (const uid in currentRuntimeState) {
        const stats = currentRuntimeState[uid];
        nextRuntimeState[uid] = {
            stickyDuration: Math.max(0, stats.stickyDuration - 1),
            cooldownDuration: Math.max(0, stats.cooldownDuration - 1)
        };
    }

    // Process active entries to set/refresh Sticky & Cooldown
    const activeEntries = allEntries.filter(e => e.uid && activeUidSet.has(e.uid));
    
    for (const entry of activeEntries) {
        if (!entry.uid) continue;

        // Logic: If an entry is activated this turn (or remains sticky):
        
        // 1. Refresh Sticky: Reset sticky timer to max if configured
        if (entry.sticky && entry.sticky > 0) {
            nextRuntimeState[entry.uid] = {
                ...nextRuntimeState[entry.uid],
                stickyDuration: entry.sticky 
            };
        }

        // 2. Set Cooldown: 
        // Cooldown prevents RE-activation after it expires. 
        if (entry.cooldown && entry.cooldown > 0) {
             nextRuntimeState[entry.uid] = {
                ...nextRuntimeState[entry.uid] || { stickyDuration: 0 },
                cooldownDuration: entry.cooldown
            };
        }
    }

    // Sort active entries by insertion order for Prompt Manager
    activeEntries.sort((a, b) => (a.insertion_order || 0) - (b.insertion_order || 0));

    return {
        activeEntries,
        updatedRuntimeState: nextRuntimeState
    };
};

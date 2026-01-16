
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
 * Implements V3 Logic & Live-Link Lifecycle (Auto-Prune):
 * 1. Check Constant/Enabled/Cooldown.
 * 2. Live-Link Lifecycle: Prune if inactive > 10 turns, unless woken by Smart Scan or Keyword.
 * 3. Primary Keys: OR logic (at least one must match).
 * 4. Secondary Keys: If present, OR logic (at least one must match).
 */
const scanEntries = (
    text: string, 
    entries: WorldInfoEntry[], 
    manualState: Record<string, boolean> = {},
    runtimeState: Record<string, WorldInfoRuntimeStats> = {},
    currentTurn: number = 0,
    aiActiveUids: Set<string> = new Set()
): { matchedEntries: WorldInfoEntry[], touchedUids: Set<string> } => {
    
    const matchedEntries: WorldInfoEntry[] = [];
    const touchedUids = new Set<string>(); // IDs that were interacted with (for updating lastActiveTurn)

    for (const entry of entries) {
        if (!entry.uid) continue;
        
        // 1. Check Enabled State (Manual Override > Card Default)
        // BUG FIX: Previously only checked `manualState !== false`. 
        // Now checks: If manual override exists, use it. Else, use entry.enabled default.
        const isEnabled = manualState[entry.uid] !== undefined
            ? manualState[entry.uid]
            : entry.enabled !== false;

        if (!isEnabled) continue;

        const stats = runtimeState[entry.uid] || { stickyDuration: 0, cooldownDuration: 0, lastActiveTurn: undefined };

        // 2. Check Runtime Cooldown
        if (stats.cooldownDuration > 0) continue;

        // 3. Constant entries always match immediately
        if (entry.constant) {
            matchedEntries.push(entry);
            continue;
        }

        // --- LIVE-LINK LIFECYCLE LOGIC (Auto-Prune) ---
        const isLiveLink = entry.uid.startsWith('mythic_');
        let isDormant = false;

        if (isLiveLink) {
            // If lastActiveTurn is undefined, it's considered new/fresh (Active)
            const lastActive = stats.lastActiveTurn !== undefined ? stats.lastActiveTurn : currentTurn;
            const inactivityAge = currentTurn - lastActive;
            
            if (inactivityAge > 10) {
                isDormant = true;
            }
        }

        // Triggers that can wake up a Dormant entry:
        // A. AI Smart Scan explicitly selected it
        const isAiSelected = aiActiveUids.has(entry.uid);
        
        // B. Keyword Match
        let isKeywordMatched = false;
        const hasPrimaryKeys = entry.keys && entry.keys.length > 0;
        
        if (hasPrimaryKeys) {
            for (const keyStr of entry.keys) {
                if (checkKeyMatch(keyStr, text, !!entry.use_regex)) {
                    isKeywordMatched = true;
                    break; 
                }
            }
        }

        // Logic Decision:
        // - If Dormant AND NOT Triggered (AI or Keyword) -> Skip (Pruned)
        // - If Dormant AND Triggered -> Wake Up (Include & Update TS)
        // - If Not Dormant -> Check keywords normally (if not AI selected)
        
        let shouldInclude = false;

        if (isAiSelected) {
            shouldInclude = true; // AI overrides everything
        } else if (isKeywordMatched) {
            // Check secondary keys if primary matched
            const hasSecondaryKeys = entry.secondary_keys && entry.secondary_keys.length > 0;
            let secondaryMatch = true; 

            if (hasSecondaryKeys) {
                secondaryMatch = false; 
                for (const keyStr of entry.secondary_keys!) {
                    if (checkKeyMatch(keyStr, text, !!entry.use_regex)) {
                        secondaryMatch = true;
                        break;
                    }
                }
            }
            if (secondaryMatch) shouldInclude = true;
        }

        // Final Filter based on Dormancy
        if (isDormant && !shouldInclude) {
            continue; // Pruned
        }

        // If not dormant, but also not triggered (and not AI selected), standard logic applies
        if (!isDormant && !shouldInclude) {
            if (isLiveLink && !isDormant) {
                // Keep live links active if they haven't timed out yet
                shouldInclude = true; 
            }
        }

        if (shouldInclude) {
            matchedEntries.push(entry);
            // If triggered by interaction (AI or Keyword), mark as touched to update timestamp
            if (isAiSelected || isKeywordMatched) {
                touchedUids.add(entry.uid);
            }
        }
    }

    return { matchedEntries, touchedUids };
};

/**
 * Helper to prepare lorebook data payload for AI Smart Scan.
 * Truncates content to 300 chars start + 100 chars end.
 * Splits into 'contextString' (Constants) and 'candidateString' (Candidates).
 */
export const prepareLorebookForAI = (entries: WorldInfoEntry[], currentTurn: number, runtimeState: Record<string, WorldInfoRuntimeStats>): { contextString: string, candidateString: string } => {
    const contextParts: string[] = [];
    const candidateParts: string[] = [];

    entries.forEach(entry => {
        if (!entry.uid || entry.enabled === false) return;

        let content = entry.content || '';
        if (content.length > 400) {
            content = content.slice(0, 300) + "\n... (đã lược bỏ) ...\n" + content.slice(-100);
        }
        content = content.replace(/\n/g, ' ');
        
        // Determine status for AI context
        let statusTag = "";
        if (entry.uid.startsWith('mythic_')) {
            const stats = runtimeState[entry.uid];
            const lastActive = stats?.lastActiveTurn !== undefined ? stats.lastActiveTurn : currentTurn; // Default new ones to active
            const age = currentTurn - lastActive;
            if (age > 10) statusTag = " [DORMANT/NGỦ ĐÔNG]";
            else statusTag = " [ACTIVE]";
        }

        const formattedEntry = `[${entry.constant ? 'Hằng số' : 'ID: ' + entry.uid}${statusTag}]
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
 */
export const performWorldInfoScan = (
    textToScan: string,
    allEntries: WorldInfoEntry[],
    manualState: Record<string, boolean>,
    currentRuntimeState: Record<string, WorldInfoRuntimeStats>,
    pinnedState: Record<string, boolean> = {},
    aiActiveUids: string[] = [], 
    bypassKeywordScan: boolean = false,
    currentTurn: number = 0 // Lifecycle Tracking
): { activeEntries: WorldInfoEntry[]; updatedRuntimeState: Record<string, WorldInfoRuntimeStats> } => {
    
    const MAX_DEPTH = 2;
    let currentDepth = 0;
    
    const activeUidSet = new Set<string>();
    const touchedUidSet = new Set<string>(); // UIDs that need timestamp update
    const aiUidSet = new Set(aiActiveUids);

    // 1. Initial Scan Setup
    
    // A. Constants
    // BUG FIX: Check strict enabled status. Manual Toggle overrides Card Default.
    const constantEntries = allEntries.filter(e => {
        if (!e.constant || !e.uid) return false;
        // Priority: Manual Toggle in Chat > Card Default Enabled State
        if (manualState[e.uid] !== undefined) {
            return manualState[e.uid];
        }
        return e.enabled !== false;
    });
    constantEntries.forEach(e => activeUidSet.add(e.uid!));
    
    // B. Pinned
    const pinnedEntries = allEntries.filter(e => e.uid && pinnedState[e.uid] && manualState[e.uid!] !== false);
    pinnedEntries.forEach(e => activeUidSet.add(e.uid!));

    // C. Sticky (Classic)
    for (const uid in currentRuntimeState) {
        if (currentRuntimeState[uid].stickyDuration > 0) {
            activeUidSet.add(uid);
        }
    }
    
    // D. AI-Activated (Add to Touched to refresh 10-turn timer)
    aiActiveUids.forEach(uid => {
        if (manualState[uid] !== false) {
            activeUidSet.add(uid);
            touchedUidSet.add(uid); 
        }
    });

    // E. Keyword Scan + Lifecycle Check
    if (!bypassKeywordScan) {
        let textBuffer = textToScan;
        
        while (currentDepth <= MAX_DEPTH) {
            const { matchedEntries, touchedUids: scanTouched } = scanEntries(
                textBuffer, 
                allEntries, 
                manualState, 
                currentRuntimeState,
                currentTurn,
                aiUidSet
            );
            
            let hasNew = false;
            let newContent = '';

            for (const entry of matchedEntries) {
                if (!entry.uid) continue;
                
                // Track touched (interacted) entries
                if (scanTouched.has(entry.uid)) {
                    touchedUidSet.add(entry.uid);
                }

                if (!activeUidSet.has(entry.uid)) {
                    activeUidSet.add(entry.uid);
                    hasNew = true;
                    newContent += '\n' + entry.content;
                }
            }

            if (!hasNew) break;
            textBuffer = newContent;
            currentDepth++;
        }
    }

    // 2. Update Runtime State
    const nextRuntimeState: Record<string, WorldInfoRuntimeStats> = {};

    // Clone existing state
    for (const uid in currentRuntimeState) {
        nextRuntimeState[uid] = { ...currentRuntimeState[uid] };
        // Decrement counters
        nextRuntimeState[uid].stickyDuration = Math.max(0, nextRuntimeState[uid].stickyDuration - 1);
        nextRuntimeState[uid].cooldownDuration = Math.max(0, nextRuntimeState[uid].cooldownDuration - 1);
    }

    // Process active entries
    const activeEntries = allEntries.filter(e => e.uid && activeUidSet.has(e.uid));
    
    for (const entry of activeEntries) {
        if (!entry.uid) continue;

        // Initialize state if missing
        if (!nextRuntimeState[entry.uid]) {
            nextRuntimeState[entry.uid] = { stickyDuration: 0, cooldownDuration: 0, lastActiveTurn: currentTurn };
        }

        // Update 10-turn Lifecycle if Touched (Interacted/Triggered)
        if (touchedUidSet.has(entry.uid)) {
            nextRuntimeState[entry.uid].lastActiveTurn = currentTurn;
        }

        // Standard Sticky/Cooldown
        if (entry.sticky && entry.sticky > 0) {
            nextRuntimeState[entry.uid].stickyDuration = entry.sticky;
        }
        if (entry.cooldown && entry.cooldown > 0) {
             nextRuntimeState[entry.uid].cooldownDuration = entry.cooldown;
        }
    }

    // Sort active entries
    activeEntries.sort((a, b) => (a.insertion_order || 0) - (b.insertion_order || 0));

    return {
        activeEntries,
        updatedRuntimeState: nextRuntimeState
    };
};

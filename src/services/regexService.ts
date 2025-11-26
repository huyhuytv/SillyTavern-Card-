
import type { RegexScript } from '../types';

/**
 * Creates a RegExp object from a string, supporting both simple strings
 * and the "/pattern/flags" format common in SillyTavern.
 * @param regexString The string to parse.
 * @returns A RegExp object.
 * @throws {Error} if the pattern is invalid.
 */
const createRegex = (regexString: string): RegExp => {
    const match = regexString.match(new RegExp('^/(.*?)/([gimsuy]*)$'));
    if (match) {
        return new RegExp(match[1], match[2]);
    } else {
        return new RegExp(regexString, 'g');
    }
};

/**
 * Extracts potential interactive blocks from text.
 * Returns pure content (without markdown fences) to be safe for Iframe injection.
 */
const extractInteractiveContent = (text: string): string[] => {
    const blocks: string[] = [];
    
    // 1. Capture Fenced Blocks (```html ... ```)
    // We capture the INNER content (group 1)
    const fencedRegex = /```(?:text|html|xml|javascript)?\s*([\s\S]*?)\s*```/gi;
    let match;
    while ((match = fencedRegex.exec(text)) !== null) {
        const content = match[1].trim();
        // Heuristic: Only keep if it looks like HTML/Script
        if (content && (content.includes('<div') || content.includes('<script') || content.includes('<style') || content.includes('<details') || content.includes('<!DOCTYPE'))) {
             blocks.push(content);
        }
    }

    // 2. Capture Raw HTML Blocks (Not fenced)
    // Some cards just dump raw <html> tags
    const rawHtmlRegex = /(?:<!DOCTYPE html>)?\s*<html[^>]*>[\s\S]*?<\/html>/gi;
    while ((match = rawHtmlRegex.exec(text)) !== null) {
        blocks.push(match[0].trim());
    }
    
    // 3. Capture Script Tags (Standalone) - often used in TavernHelper
    const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>/gi;
    while ((match = scriptRegex.exec(text)) !== null) {
        // Avoid duplicates if already caught by html block
        const isAlreadyCaught = blocks.some(b => b.includes(match![0]));
        if (!isAlreadyCaught) {
            blocks.push(match[0].trim());
        }
    }

    return blocks;
};


/**
 * THE PIPELINE PROCESSOR
 * 
 * Strategy: "Harvest - Decorate - Restore"
 * 1. Harvest: Scan original text for ANY code/html blocks. Save them safely.
 * 2. Decorate: Run all Regex scripts. These might delete the blocks from the text (which is good for display).
 * 3. Restore: When generating the `interactiveHtml` output, look at what's left. 
 *    If the scripts deleted the HTML, we Restore it from step 1.
 * 
 * @param rawText The text to process
 * @param scripts The list of regex scripts
 * @param targetPlacement Array of placement IDs to filter scripts. 
 *                        1 = User Input, 2 = AI Output, 3 = Edit (Not Impl). 
 *                        Default is [2] (Output).
 */
export const processWithRegex = (
    rawText: string, 
    scripts: RegexScript[] = [],
    targetPlacement: number[] = [2] 
): { displayContent: string; interactiveHtml: string | null; diagnosticLog: string; } => {
    
    const diagnosticLog: string[] = [`[START] Bắt đầu xử lý Kịch bản Regex (Mục tiêu: ${targetPlacement.join(',')}).`];
    let processedText = rawText;

    // --- STEP 1: THE HARVEST (Thu hoạch) ---
    // Save copies of any interactive content before we let the regexes loose.
    // Only relevant for Output mode generally, but good safety practice.
    const originalArtifacts = extractInteractiveContent(rawText);
    if (originalArtifacts.length > 0) {
        diagnosticLog.push(`[HARVEST] Đã tìm thấy ${originalArtifacts.length} khối tiềm năng trong văn bản gốc.`);
    }

    // --- STEP 2: THE DECORATOR (Xử lý hiển thị) ---
    // Filter valid scripts based on Placement and Enabled status
    const validScripts = (scripts || []).filter((script, index) => {
        if (script.disabled) return false;
        
        // Determine script placement. If undefined/empty, legacy ST behavior defaults to [2] (Output)
        const scriptPlacement = (script.placement && script.placement.length > 0) ? script.placement : [2];
        
        // Check if any of the target placements exist in the script's placement
        const isApplicable = targetPlacement.some(p => scriptPlacement.includes(p));
        
        if (!isApplicable) return false;
        if (!script.findRegex) return false;
        return true;
    });

    // Sort logic: Content Generators First -> Content Removers Last
    const sortedScripts = [...validScripts].sort((a, b) => {
        const aGen = a.replaceString.includes('```') || a.replaceString.includes('<div') || a.replaceString.includes('<script');
        const bGen = b.replaceString.includes('```') || b.replaceString.includes('<div') || b.replaceString.includes('<script');
        const aDel = a.replaceString.trim() === '';
        const bDel = b.replaceString.trim() === '';
        
        if (aGen && !bGen) return -1;
        if (!aGen && bGen) return 1;
        if (aDel && !bDel) return 1;
        if (!aDel && bDel) return -1;
        return 0;
    });

    if (sortedScripts.length > 0) {
        diagnosticLog.push(`[PROCESS] Đang chạy ${sortedScripts.length} kịch bản phù hợp.`);
        sortedScripts.forEach((script, index) => {
            try {
                const regex = createRegex(script.findRegex);
                const textBefore = processedText;
                processedText = textBefore.replace(regex, script.replaceString);
                
                if (textBefore !== processedText) {
                     diagnosticLog.push(` -> [OK] "${script.scriptName || 'Script'}" đã thay đổi nội dung.`);
                }
            } catch (error) {
                diagnosticLog.push(` -> [ERR] "${script.scriptName}": ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    } else {
        // diagnosticLog.push(`[INFO] Không có kịch bản nào phù hợp với vị trí này.`);
    }

    // --- STEP 3: THE RESTORATION (Phục hồi & Trích xuất) ---
    // Only relevant if we are processing Output (2), as Input regexes (1) usually don't generate HTML for iframe
    const isOutputMode = targetPlacement.includes(2);
    
    let finalInteractiveHtml: string | null = null;
    let usedRecovery = false;

    if (isOutputMode) {
        // Check what survived in the processed text
        const survivedArtifacts = extractInteractiveContent(processedText);
        
        if (survivedArtifacts.length > 0) {
            finalInteractiveHtml = survivedArtifacts.join('\n');
            diagnosticLog.push(`[EXTRACT] Sử dụng ${survivedArtifacts.length} khối từ văn bản đã xử lý.`);
        } else if (originalArtifacts.length > 0) {
            // CRITICAL RECOVERY for Output
            finalInteractiveHtml = originalArtifacts.join('\n');
            usedRecovery = true;
            diagnosticLog.push(`[RECOVERY] ⚠️ Cảnh báo: Regex đã xóa nội dung tương tác. Đã khôi phục ${originalArtifacts.length} khối gốc cho Iframe.`);
        }
    }

    // --- STEP 4: CLEANUP DISPLAY TEXT ---
    let displayContent = processedText;
    
    if (isOutputMode) {
        // Remove technical blocks from display text in Output mode
        displayContent = displayContent.replace(/```(?:text|html|xml|javascript)?\s*([\s\S]*?)\s*```/gi, (match, content) => {
            if (content && (content.includes('<div') || content.includes('<script') || content.includes('<style') || content.includes('<!DOCTYPE'))) {
                return ''; 
            }
            return match;
        });
        
        // Clean up ST specific tags
        displayContent = displayContent
            .replace(/<\/?(maintext|opening|StatusPlaceHolderImpl|Status_?block)>[\s\S]*?<\/?(maintext|opening|StatusPlaceHolderImpl|Status_?block)>/gi, '') 
            .replace(/<\/?(maintext|opening|StatusPlaceHolderImpl|Status_?block)\/?>/gi, '')
            .trim();
    }
    
    if (usedRecovery) {
        diagnosticLog.push('[RESULT] Chế độ Phục hồi: Giao diện hiển thị văn bản sạch, Iframe chạy mã gốc.');
    }

    // diagnosticLog.push('[END] Hoàn tất.');

    return { 
        displayContent, 
        interactiveHtml: finalInteractiveHtml, 
        diagnosticLog: diagnosticLog.join('\n') 
    };
};


import type { AdventureSnapshot, ChatSession, CharacterCard, SillyTavernPreset, UserPersona } from '../types';
import * as dbService from './dbService';
import { characterToStorable } from './dbService';

/**
 * Creates an "Adventure Snapshot" (Game Save) containing all necessary data to resume a session exactly as is.
 * @param session The chat session to export
 * @param character The character card associated with the session
 * @param preset The preset used in the session
 * @param persona The user persona (optional)
 */
export const createSnapshot = (
    session: ChatSession,
    character: CharacterCard,
    preset: SillyTavernPreset,
    persona: UserPersona | null
): void => {
    const snapshot: AdventureSnapshot = {
        version: 1,
        timestamp: Date.now(),
        meta: {
            exportedBy: 'AI Studio Card Tool',
            description: `Bản ghi phiêu lưu: ${character.name} - ${new Date().toLocaleString()}`
        },
        data: {
            character: character,
            characterFileName: session.characterFileName, // Keep original filename ref
            preset: preset,
            session: session,
            userPersona: persona
        }
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Format: Adventure_CharacterName_SessionID.json
    const safeCharName = character.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `Adventure_${safeCharName}_${session.sessionId.substring(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/**
 * Imports an Adventure Snapshot JSON file and restores all data to IndexedDB.
 * @param file The JSON file to import
 * @returns Promise resolving to the restored Session ID
 */
export const importSnapshot = async (file: File): Promise<string> => {
    try {
        const text = await file.text();
        const snapshot = JSON.parse(text) as AdventureSnapshot;

        // Basic Validation
        if (!snapshot.data || !snapshot.data.session || !snapshot.data.character) {
            throw new Error("File không hợp lệ: Thiếu dữ liệu phiên hoặc nhân vật.");
        }

        const { character, characterFileName, preset, session, userPersona } = snapshot.data;

        // 1. Restore Character (Overwrite or Add)
        // We ensure we use the filename from the snapshot to maintain the link
        const charStorable = await characterToStorable({
            card: character,
            fileName: characterFileName,
            avatarUrl: null, // Avatar logic is complex with blobs, usually we might need to embed base64 in snapshot if we want full portability. 
                             // For now, if card has internal avatar (V3) it works. If external, it might be missing.
            avatarFile: null 
        });
        await dbService.saveCharacter(charStorable);

        // 2. Restore Preset
        if (preset) {
            await dbService.savePreset(preset);
        }

        // 3. Restore Persona
        if (userPersona) {
            await dbService.saveUserPersona(userPersona);
        }

        // 4. Restore Session
        // Ensure session ID links to the correct character file name (in case it changed or is new)
        session.characterFileName = characterFileName; 
        
        // If importing, we might want to update the 'lastUpdated' to bring it to top
        session.lastUpdated = Date.now();
        
        await dbService.saveChatSession(session);

        return session.sessionId;

    } catch (e) {
        console.error("Import failed", e);
        throw new Error(`Lỗi khi nhập bản ghi: ${e instanceof Error ? e.message : String(e)}`);
    }
};

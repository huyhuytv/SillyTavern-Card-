
import React, { useState, useEffect, useRef } from 'react';
import type { ChatSession, ChatMessage, WorldInfoEntry, SillyTavernPreset, CharacterInContext } from '../types';
import * as dbService from '../services/dbService';
import { useCharacter } from '../contexts/CharacterContext';
import { usePreset } from '../contexts/PresetContext';
import { useUserPersona } from '../contexts/UserPersonaContext';
import { Loader } from './Loader';
import { GreetingSelectorModal } from './GreetingSelectorModal';
import { useTimeAgo, truncateText, parseLooseJson } from '../utils'; // IMPORTED parseLooseJson
import { processWithRegex } from '../services/regexService';
import { performWorldInfoScan } from '../services/worldInfoScanner';
import { processVariableUpdates } from '../services/variableEngine';
import { createSnapshot, importSnapshot } from '../services/snapshotService';
import { ExportModal } from './ExportModal';
import { useToast } from './ToastSystem';

interface ChatLobbyProps {
    onSessionSelect: (sessionId: string) => void;
}

const ContinueCard: React.FC<{
    session: ChatSession;
    character?: CharacterInContext;
    onClick: () => void;
    onDelete: () => void;
    onExport: () => void; // New Prop
}> = ({ session, character, onClick, onDelete, onExport }) => {
    const timeAgo = useTimeAgo(session.lastUpdated);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    const handleMenuButtonClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(prev => !prev);
    };

    const handleDeleteButtonClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete();
        setIsMenuOpen(false);
    };
    
    const handleExportButtonClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onExport();
        setIsMenuOpen(false);
    };


    return (
        <div 
            className="bg-slate-800/70 p-4 rounded-lg flex gap-4 items-center hover:bg-slate-700/80 transition-colors duration-200 group relative"
        >
            <button
                onClick={onClick}
                className="w-16 h-16 rounded-full bg-slate-700 flex-shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                aria-label={`Tiếp tục trò chuyện với ${character?.card.name || session.characterFileName}`}
            >
                {character?.avatarUrl ? (
                    <img src={character.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                    </div>
                )}
            </button>
            <div className="flex-grow overflow-hidden flex flex-col items-start">
                <button
                    onClick={onClick}
                    className="px-3 py-1 bg-slate-700 hover:bg-sky-600 text-white text-sm font-bold rounded-md transition-colors shadow-sm border border-slate-600 hover:border-sky-500 mb-1 max-w-full truncate text-left"
                >
                    {character?.card.name || session.characterFileName}
                </button>
                <p className="text-sm text-slate-400 italic truncate w-full">{session.lastMessageSnippet || 'Bắt đầu cuộc trò chuyện...'}</p>
                <p className="text-xs text-slate-500 mt-1">{timeAgo}</p>
            </div>

            <div ref={menuRef} className="absolute top-2 right-2">
                <button
                    onClick={handleMenuButtonClick}
                    className="p-2 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-900/50 hover:text-white transition-all focus:opacity-100"
                    aria-label="Tùy chọn cuộc trò chuyện"
                    aria-haspopup="true"
                    aria-expanded={isMenuOpen}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                </button>
                {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-md shadow-lg z-10 py-1">
                        <button
                            onClick={handleExportButtonClick}
                            className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-sky-400 hover:bg-sky-500/10 border-b border-slate-700/50"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            <span>Xuất Bản Ghi Phiêu Lưu</span>
                        </button>
                        <button
                            onClick={handleDeleteButtonClick}
                            className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                            </svg>
                            <span>Xóa cuộc trò chuyện</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const NewChatCard: React.FC<{
    character: CharacterInContext;
    onClick: () => void;
}> = ({ character, onClick }) => {
    return (
        <div className="bg-slate-800/50 p-3 rounded-lg flex flex-col items-center gap-2 hover:bg-slate-800/80 transition-colors duration-200">
            <button
                onClick={onClick}
                className="w-20 h-20 rounded-full bg-slate-700 flex-shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                aria-label={`Bắt đầu cuộc trò chuyện mới với ${character.card.name}`}
            >
                {character.avatarUrl ? (
                    <img src={character.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                     <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                    </div>
                )}
            </button>
            <button
                onClick={onClick}
                className="w-full mt-1 px-3 py-1.5 bg-slate-700 hover:bg-sky-600 text-slate-200 hover:text-white rounded-md text-sm font-semibold transition-colors truncate shadow-sm border border-slate-600 hover:border-sky-500"
            >
                {character.card.name}
            </button>
        </div>
    );
};

// --- IMPORT AREA COMPONENT ---
const AdventureImporter: React.FC<{ onImport: (file: File) => void, isLoading: boolean }> = ({ onImport, isLoading }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onImport(e.target.files[0]);
            e.target.value = ''; // Reset
        }
    };

    return (
        <div 
            onClick={() => !isLoading && fileInputRef.current?.click()}
            className={`border-2 border-dashed border-slate-600 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-slate-800/50 hover:border-sky-500/50 group ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".json"
                onChange={handleFileChange}
                disabled={isLoading}
            />
            <div className="bg-slate-800 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-sky-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </div>
            <h3 className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">Tiếp tục từ Bản Ghi Phiêu Lưu</h3>
            <p className="text-xs text-slate-500 mt-1">Kéo thả file .json hoặc nhấn để tải lên (Backup/Save File)</p>
        </div>
    );
};

export const ChatLobby: React.FC<ChatLobbyProps> = ({ onSessionSelect }) => {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { characters, isLoading: charactersLoading, loadCharacter, reloadCharacters } = useCharacter();
    const { presets, activePresetName, reloadPresets } = usePreset();
    const { activePersonaId, activePersona, personas, reloadPersonas } = useUserPersona();
    const [greetingModalChar, setGreetingModalChar] = useState<CharacterInContext | null>(null);
    const [error, setError] = useState<string>('');
    const [isImporting, setIsImporting] = useState(false);
    const { showToast } = useToast();
    
    // Export Modal State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [sessionToExport, setSessionToExport] = useState<ChatSession | null>(null);

    // Function to refresh session list
    const refreshSessions = async () => {
        setIsLoading(true);
        try {
            const loadedSessions = await dbService.getAllChatSessions();
            loadedSessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
            setSessions(loadedSessions);
        } catch (err) {
            setError("Không thể tải các phiên trò chuyện đã lưu.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshSessions();
    }, []);

    const activePreset = presets.find(p => p.name === activePresetName);

    const handleDeleteSession = async (sessionId: string, characterName: string) => {
        try {
            await dbService.deleteChatSession(sessionId);
            setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
        } catch (err) {
            setError("Không thể xóa phiên trò chuyện.");
        }
    };
    
    // --- IMPORT LOGIC ---
    const handleImportSnapshot = async (file: File) => {
        setIsImporting(true);
        setError('');
        try {
            const sessionId = await importSnapshot(file);
            
            // Reload EVERYTHING to ensure contexts are up to date from DB
            // This is critical because useChatEngine relies on Contexts (Character, Preset, Persona)
            // matching the IDs stored in the Session.
            
            await Promise.all([
                reloadCharacters(),
                reloadPresets(),
                reloadPersonas(),
                refreshSessions()
            ]);
            
            // Auto-redirect to the imported session
            showToast("Nhập bản ghi thành công!", 'success');
            onSessionSelect(sessionId);
            
        } catch (err) {
            setError(`Lỗi nhập bản ghi: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsImporting(false);
        }
    };

    // --- EXPORT LOGIC ---
    const handleExportClick = (session: ChatSession) => {
        setSessionToExport(session);
        setIsExportModalOpen(true);
    };

    const performExport = (filename: string) => {
        if (!sessionToExport) return;
        
        const session = sessionToExport;
        const char = characters.find(c => c.fileName === session.characterFileName);
        const personaToExport = personas.find(p => p.id === session.userPersonaId) || activePersona;

        let sourcePreset: SillyTavernPreset | undefined;
        if (activePreset && activePreset.name === session.presetName) {
            sourcePreset = activePreset;
        } else {
            sourcePreset = presets.find(p => p.name === session.presetName);
        }
        if (!sourcePreset) sourcePreset = activePreset;

        if (!char || !sourcePreset) {
            alert("Không thể xuất: Dữ liệu nhân vật hoặc preset gốc bị thiếu.");
            return;
        }

        const presetToExport = {
            ...sourcePreset,
            name: `[Cài đặt] ${char.card.name}`
        };

        try {
            // Need to manually trigger download here since createSnapshot handles it internally with logic that doesn't easily accept filename override
            // But actually createSnapshot handles the blob creation. I should modify it or just copy its logic here.
            // For now, I'll assume createSnapshot *forces* a name, I need to update it or reimplement it here briefly.
            // RE-IMPLEMENTATION for Custom Name:
            
            const snapshot = {
                version: 1,
                timestamp: Date.now(),
                meta: {
                    exportedBy: 'AI Studio Card Tool',
                    description: `Bản ghi phiêu lưu: ${char.card.name} - ${new Date().toLocaleString()}`
                },
                data: {
                    character: char.card,
                    characterFileName: session.characterFileName,
                    preset: presetToExport,
                    session: session,
                    userPersona: personaToExport
                }
            };

            const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (e) {
            console.error(e);
            alert("Lỗi khi tạo bản ghi xuất.");
        }
    };


    const handleStartNewChat = async (character: CharacterInContext, greeting: string) => {
        if (!activePreset) {
            setError("Không có preset nào được chọn. Vui lòng chọn một preset trong tab Preset.");
            setGreetingModalChar(null);
            return;
        }

        const newSessionId = character.fileName;

        const existingSession = sessions.find(s => s.sessionId === newSessionId);
        if (existingSession) {
            if (!window.confirm(`Một cuộc trò chuyện với ${character.card.name} đã tồn tại. Bạn có muốn bắt đầu lại từ đầu và xóa cuộc trò chuyện cũ không?`)) {
                setGreetingModalChar(null);
                return;
            }
        }

        // Replace {{user}} and {{char}} macros directly in the greeting content
        const userName = activePersona ? activePersona.name : 'User';
        const charName = character.card.name;
        const processedGreetingRaw = greeting
            .replace(/{{user}}/gi, userName)
            .replace(/{{char}}/gi, charName);

        // 1. Process the greeting to separate content from interactive HTML
        let { displayContent, interactiveHtml, diagnosticLog } = processWithRegex(
            processedGreetingRaw,
            character.card.extensions?.regex_scripts || []
        );

        // --- FORCE IFRAME LOGIC FOR SCRIPT CARDS ---
        // Check if card has enabled TavernHelper scripts
        const hasEnabledScripts = character.card.extensions?.TavernHelper_scripts?.some(
            s => s.type === 'script' && s.value.enabled
        );

        // If we have scripts but no HTML was found by Regex, FORCE the creation of an Iframe message.
        // We put the text content inside the HTML so it displays, while the scripts run in background.
        if (hasEnabledScripts && !interactiveHtml) {
            console.log('[ChatLobby] Detected TavernHelper scripts. Forcing Interactive Message.');
            interactiveHtml = displayContent || processedGreetingRaw; // Use the text as the HTML body
            displayContent = ''; // Clear display content so we don't double render
            if (!interactiveHtml.trim()) interactiveHtml = '<div></div>'; // Ensure at least empty div if text is empty
        }
        // -------------------------------------------

        // 2. Pre-parse initial variables from the card using LOOSE JSON PARSER
        let initialVariables = {};
        if (character.card.char_book?.entries) {
            const initVarEntry = character.card.char_book.entries.find(
                (entry: WorldInfoEntry) => entry.comment?.includes('[InitVar]')
            );
            if (initVarEntry?.content) {
                try {
                    // Use parseLooseJson instead of JSON.parse
                    initialVariables = parseLooseJson(initVarEntry.content);
                } catch (e) {
                    console.error("Lỗi phân tích JSON [InitVar] khi tạo cuộc trò chuyện mới:", e);
                    setError("Không thể phân tích dữ liệu biến khởi tạo từ thẻ nhân vật.");
                }
            }
        }

        // --- LOGIC MỚI: CHẠY SCRIPT KHỞI TẠO TRONG LỜI CHÀO ---
        // Nhiều thẻ Game (như Tu Tiên DnD) đặt script <UpdateVariable> ngay trong first_mes để khởi tạo chỉ số.
        // Nếu không chạy cái này, nhân vật sẽ bắt đầu với chỉ số mặc định (thường là 0 hoặc rỗng).
        let startVariables = initialVariables;
        try {
            const result = processVariableUpdates(processedGreetingRaw, initialVariables);
            startVariables = result.updatedVariables;
        } catch (e) {
            console.warn("Không thể thực thi script khởi tạo trong lời chào đầu:", e);
            // Vẫn tiếp tục với initialVariables nếu lỗi
        }
        // ------------------------------------------------------

        // 3. Perform initial World Info scan on the greeting
        const { updatedRuntimeState } = performWorldInfoScan(
            processedGreetingRaw,
            character.card.char_book?.entries || [],
            {}, // Initial manual state is empty/default
            {}  // Initial runtime state is empty
        );

        const initialMessages: ChatMessage[] = [];
        let messageIdCounter = 0;

        if (displayContent.trim()) {
            initialMessages.push({
                id: `msg-start-${Date.now()}-${messageIdCounter++}`,
                role: 'model',
                content: displayContent,
                originalRawContent: processedGreetingRaw
            });
        }

        if (interactiveHtml) {
            initialMessages.push({
                id: `msg-start-${Date.now()}-${messageIdCounter++}`,
                role: 'model',
                content: '', // Content empty because it's fully rendered by Iframe
                interactiveHtml: interactiveHtml,
                originalRawContent: processedGreetingRaw
            });
        }
        
        // Fallback if regex processing results in nothing but the original greeting existed
        // (And we didn't force interactive mode above)
        if (initialMessages.length === 0 && processedGreetingRaw) {
            initialMessages.push({
                id: `msg-start-${Date.now()}-${messageIdCounter++}`,
                role: 'model',
                content: processedGreetingRaw
            });
        }

        const newSession: ChatSession = {
            sessionId: newSessionId,
            characterFileName: character.fileName,
            presetName: activePreset.name,
            userPersonaId: activePersonaId,
            chatHistory: initialMessages,
            longTermSummaries: [],
            variables: startVariables, // Sử dụng biến đã được script cập nhật
            worldInfoRuntime: updatedRuntimeState, // Initialize with scanned state
            lastMessageSnippet: truncateText(displayContent || processedGreetingRaw || "Bắt đầu cuộc trò chuyện...", 50),
            lastUpdated: Date.now(),
            initialDiagnosticLog: diagnosticLog,
        };

        try {
            await dbService.saveChatSession(newSession);
            onSessionSelect(newSessionId);
        } catch (err) {
            setError("Không thể tạo phiên trò chuyện mới.");
        }
        setGreetingModalChar(null);
    };

    const charactersWithSessions = new Set(sessions.map(s => s.characterFileName));
    const newCharacters = characters.filter(c => !charactersWithSessions.has(c.fileName));
    const sessionsWithCharacterData = sessions.map(s => ({
        session: s,
        character: characters.find(c => c.fileName === s.characterFileName)
    })).filter(item => item.character); // Filter out sessions for deleted characters

    if (isLoading || charactersLoading) {
        return <div className="flex justify-center items-center h-full"><Loader message="Đang tải sảnh trò chuyện..." /></div>;
    }

    // Default export name logic
    const getInitialExportName = () => {
        if (!sessionToExport) return 'Adventure';
        const charName = characters.find(c => c.fileName === sessionToExport.characterFileName)?.card.name || 'Character';
        const safeCharName = charName.replace(/[^a-z0-9]/gi, '_');
        return `Adventure_${safeCharName}_${sessionToExport.sessionId.substring(0, 8)}`;
    };

    return (
        <div className="space-y-10">
            {error && <p className="text-red-400 text-center bg-red-900/20 p-3 rounded">{error}</p>}
            
            {/* Import / Snapshot Area */}
            <div className="animate-fade-in-up">
                <AdventureImporter onImport={handleImportSnapshot} isLoading={isImporting} />
            </div>

            {/* Continue Section */}
            <div>
                <h2 className="text-2xl font-bold text-sky-400 mb-4 border-b-2 border-slate-700 pb-2">Tiếp tục nhân vật</h2>
                {sessionsWithCharacterData.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sessionsWithCharacterData.map(({ session, character }) => (
                            <ContinueCard 
                                key={session.sessionId}
                                session={session}
                                character={character}
                                onClick={() => onSessionSelect(session.sessionId)}
                                onDelete={() => handleDeleteSession(session.sessionId, character?.card.name || session.characterFileName)}
                                onExport={() => handleExportClick(session)}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-slate-500 italic">Không có cuộc trò chuyện nào đang diễn ra.</p>
                )}
            </div>

            {/* New Adventure Section */}
            <div>
                <h2 className="text-2xl font-bold text-sky-400 mb-4 border-b-2 border-slate-700 pb-2">Bắt đầu cuộc phiêu lưu mới</h2>
                {newCharacters.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                       {newCharacters.map(character => (
                           <NewChatCard 
                                key={character.fileName}
                                character={character}
                                onClick={() => setGreetingModalChar(character)}
                           />
                       ))}
                    </div>
                ) : (
                     <p className="text-slate-500 italic">Tất cả các nhân vật đã có cuộc trò chuyện. Tải lên nhân vật mới để bắt đầu cuộc phiêu lưu mới!</p>
                )}
            </div>

            {greetingModalChar && activePreset && (
                <GreetingSelectorModal 
                    character={greetingModalChar}
                    preset={activePreset}
                    onClose={() => setGreetingModalChar(null)}
                    onStart={(greeting) => handleStartNewChat(greetingModalChar, greeting)}
                />
            )}

            <ExportModal 
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onConfirm={performExport}
                initialFileName={getInitialExportName()}
                title="Xuất Bản Ghi Phiêu Lưu"
                fileExtension=".json"
            />
        </div>
    );
};

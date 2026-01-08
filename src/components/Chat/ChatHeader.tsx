
import React, { useState, useEffect, useRef } from 'react';
import type { VisualState } from '../../types';
import { usePreset } from '../../contexts/PresetContext';
import { useTTS } from '../../contexts/TTSContext';
import { getConnectionSettings, getActiveModel } from '../../services/settingsService';

interface ChatHeaderProps {
    characterName: string;
    onBack: () => void;
    isImmersive: boolean;
    setIsImmersive: (value: boolean) => void;
    visualState: VisualState;
    onVisualUpdate: (type: 'bg' | 'music' | 'sound' | 'class', value: string) => void;
    onToggleHUD?: () => void;
    isHUDOpen?: boolean;
    onToggleStatusHUD?: () => void;
    isStatusHUDOpen?: boolean;
    activePresetName?: string;
    onPresetChange?: (presetName: string) => void;
    onToggleAssistant?: () => void;
    isAssistantOpen?: boolean;
    // NEW: RPG Dashboard
    onToggleRpgDashboard?: () => void;
    isRpgDashboardOpen?: boolean;
    hasRpgData?: boolean;
}

const VisualSettingsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    visualState: VisualState;
    onUpdate: (type: 'bg' | 'music' | 'sound' | 'class', value: string) => void;
}> = ({ isOpen, onClose, visualState, onUpdate }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen) {
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    onClose();
                } else if (event.key === 'Tab' && modalRef.current) {
                    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (event.shiftKey) { // Shift + Tab
                        if (document.activeElement === firstElement) {
                            lastElement.focus();
                            event.preventDefault();
                        }
                    } else { // Tab
                        if (document.activeElement === lastElement) {
                            firstElement.focus();
                            event.preventDefault();
                        }
                    }
                }
            };

            document.addEventListener('keydown', handleKeyDown);
            setTimeout(() => closeButtonRef.current?.focus(), 100);

            return () => {
                document.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [isOpen, onClose]);


    if (!isOpen) return null;

    return (
        <div ref={modalRef} className="absolute top-14 right-4 w-80 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 animate-fade-in-up p-4">
            <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
                <h3 className="font-bold text-slate-200">Cài đặt Giao diện & Âm thanh</h3>
                <button 
                    ref={closeButtonRef} 
                    onClick={onClose} 
                    className="text-slate-400 hover:text-white"
                    aria-label="Đóng cài đặt giao diện"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
            </div>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Link Hình nền (URL)</label>
                    <input 
                        type="text" 
                        value={visualState.backgroundImage || ''} 
                        onChange={(e) => onUpdate('bg', e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-xs text-slate-200"
                    />
                    <button onClick={() => onUpdate('bg', 'off')} className="text-xs text-red-400 mt-1 hover:underline">Xóa nền</button>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Link Nhạc nền (URL)</label>
                    <input 
                        type="text" 
                        value={visualState.musicUrl || ''} 
                        onChange={(e) => onUpdate('music', e.target.value)}
                        placeholder="https://... (mp3/ogg)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-xs text-slate-200"
                    />
                    <button onClick={() => onUpdate('music', 'off')} className="text-xs text-red-400 mt-1 hover:underline">Tắt nhạc</button>
                </div>
                 <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Hiệu ứng CSS Global</label>
                    <input 
                        type="text" 
                        value={visualState.globalClass || ''} 
                        onChange={(e) => onUpdate('class', e.target.value)}
                        placeholder="grayscale, blur-sm, sepia..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-xs text-slate-200"
                    />
                </div>
            </div>
        </div>
    )
};

const PresetTuningModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    activePresetName?: string;
    onPresetChange?: (name: string) => void;
}> = ({ isOpen, onClose, activePresetName, onPresetChange }) => {
    const { presets } = usePreset();
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen || !onPresetChange) return null;

    return (
        <div ref={modalRef} className="absolute top-14 right-16 w-64 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 animate-fade-in-up flex flex-col max-h-[60vh]">
            <div className="p-3 border-b border-slate-700 bg-slate-900/50 rounded-t-xl shrink-0">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" /></svg>
                    Live Tuning (Preset)
                </h3>
            </div>
            <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                {presets.map(preset => (
                    <button
                        key={preset.name}
                        onClick={() => { onPresetChange(preset.name); onClose(); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                            activePresetName === preset.name 
                            ? 'bg-indigo-600 text-white shadow-sm' 
                            : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                        aria-label={`Chọn preset ${preset.name}`}
                    >
                        <span className="truncate">{preset.name}</span>
                        {activePresetName === preset.name && <span className="text-[10px]">●</span>}
                    </button>
                ))}
            </div>
        </div>
    );
};

// --- TTS Controls Component ---
const TTSControls: React.FC = () => {
    const { isPlaying, isPaused, autoPlayEnabled, toggleAutoPlay, togglePause, skip, isLoading } = useTTS();
    const { activePresetName, presets } = usePreset();
    const activePreset = presets.find(p => p.name === activePresetName);
    const ttsEnabled = activePreset?.tts_enabled === true;

    if (!ttsEnabled) return null;

    return (
        <div className="flex items-center bg-slate-800/80 rounded-full px-2 py-1 gap-1 border border-slate-600/50 mr-2">
            {/* Auto Play Toggle */}
            <button
                onClick={toggleAutoPlay}
                className={`p-1.5 rounded-full transition-colors ${autoPlayEnabled ? 'text-sky-400 bg-sky-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                title={autoPlayEnabled ? "Tự động đọc: BẬT" : "Tự động đọc: TẮT"}
                aria-label={autoPlayEnabled ? "Tắt tự động đọc" : "Bật tự động đọc"}
                aria-pressed={autoPlayEnabled}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
            </button>

            {/* Play/Pause/Loading/Skip Group (Visible when active or paused) */}
            {(isPlaying || isPaused || isLoading) && (
                <>
                    <div className="w-px h-3 bg-slate-600 mx-1"></div>
                    
                    {/* Pause/Resume */}
                    <button
                        onClick={togglePause}
                        className={`p-1.5 rounded-full text-slate-200 hover:text-white hover:bg-slate-700 transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={isPaused ? "Tiếp tục" : "Tạm dừng"}
                        aria-label={isPaused ? "Tiếp tục đọc" : "Tạm dừng đọc"}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                             <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : isPaused ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        )}
                    </button>

                    {/* Skip */}
                    <button
                        onClick={skip}
                        className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        title="Bỏ qua (Next)"
                        aria-label="Bỏ qua câu hiện tại"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L9 12.323V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 009 6v1.677L4.555 5.168z" /></svg>
                    </button>
                </>
            )}
        </div>
    );
};

// --- Model Badge Component ---
const ModelBadge: React.FC = () => {
    const conn = getConnectionSettings();
    const activeModel = getActiveModel();
    
    const getBadgeStyle = () => {
        if (conn.source === 'openrouter') return 'bg-purple-900/30 text-purple-300 border-purple-500/30';
        if (conn.source === 'proxy') return 'bg-cyan-900/30 text-cyan-300 border-cyan-500/30';
        return 'bg-sky-900/30 text-sky-300 border-sky-500/30'; // Gemini
    };

    const getSourceName = () => {
        if (conn.source === 'openrouter') return 'OR';
        if (conn.source === 'proxy') return 'Proxy';
        return 'Google';
    };

    return (
        <div className={`px-2 py-0.5 rounded border text-[10px] font-mono flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity cursor-help ${getBadgeStyle()}`} title={`Nguồn: ${conn.source}, Model: ${activeModel}`}>
            <span className="font-bold">{getSourceName()}:</span>
            <span className="truncate max-w-[100px]">{activeModel}</span>
        </div>
    );
};

export const ChatHeader: React.FC<ChatHeaderProps> = ({ 
    characterName, onBack, isImmersive, setIsImmersive, visualState, onVisualUpdate, 
    onToggleHUD, isHUDOpen, onToggleStatusHUD, isStatusHUDOpen,
    activePresetName, onPresetChange, onToggleAssistant, isAssistantOpen,
    onToggleRpgDashboard, isRpgDashboardOpen, hasRpgData
}) => {
    const [isVisualMenuOpen, setIsVisualMenuOpen] = useState(false);
    const [isTuningMenuOpen, setIsTuningMenuOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const handleCloseMenu = () => {
        setIsVisualMenuOpen(false);
        triggerRef.current?.focus();
    }

    const headerClasses = isImmersive
        ? "p-3 bg-slate-900/60 backdrop-blur-md border-b border-white/10 flex items-center gap-4 relative z-10 transition-all duration-300 hover:bg-slate-900/80"
        : "p-3 border-b border-slate-700 flex items-center gap-4 relative z-10 bg-slate-800/80 backdrop-blur-md";

    return (
        <div className={headerClasses}>
            <button 
                onClick={isImmersive ? () => setIsImmersive(false) : onBack} 
                className="text-slate-400 hover:text-sky-400 transition-colors" 
                title={isImmersive ? "Thoát chế độ nhà hát" : "Quay lại"}
                aria-label={isImmersive ? "Thoát chế độ nhà hát" : "Quay lại sảnh chờ"}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    {isImmersive 
                     ? <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 011 1v1.586l2.293-2.293a1 1 0 011.414 1.414L5.414 15H7a1 1 0 010 2H3a1 1 0 01-1-1v-4a1 1 0 011-1zm13.707-1.293a1 1 0 00-1.414-1.414L13.586 15H12a1 1 0 000 2h4a1 1 0 001-1v-4z" clipRule="evenodd" />
                     : <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    }
                </svg>
            </button>
            <div className="flex-grow min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-200 truncate">{characterName}</h2>
                    {/* Model Badge added here */}
                    {!isImmersive && <ModelBadge />}
                </div>
                <div className="flex items-center gap-2">
                    {isImmersive && <p className="text-xs text-slate-400 hidden sm:block">{visualState.musicUrl ? '♫ Đang phát nhạc' : 'Chế độ Nhà hát'}</p>}
                    {!isImmersive && activePresetName && <span className="text-xs text-indigo-400 truncate hidden sm:block">Preset: {activePresetName}</span>}
                </div>
            </div>

            {/* TTS Controls (NEW) */}
            <TTSControls />

            {/* RPG Dashboard Toggle (NEW - Only show if card has RPG data) */}
            {hasRpgData && onToggleRpgDashboard && (
                <button
                    onClick={onToggleRpgDashboard}
                    className={`p-2 rounded-full transition-colors ${isRpgDashboardOpen ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/50' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    title="Bật/Tắt RPG Dashboard (Mythic Engine)"
                    aria-label="Bật tắt bảng điều khiển RPG"
                    aria-pressed={isRpgDashboardOpen}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2.25a3 3 0 013 3v1h2a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1h2zm3-1a1 1 0 011-1h.5a1 1 0 011 1v1h-2.5V5zm7 4a1 1 0 10-2 0 1 1 0 002 0zm-9 0a1 1 0 10-2 0 1 1 0 002 0zm9 3a1 1 0 10-2 0 1 1 0 002 0zm-9 0a1 1 0 10-2 0 1 1 0 002 0z" clipRule="evenodd" />
                    </svg>
                </button>
            )}

            {/* Assistant Toggle (NEW) */}
            {onToggleAssistant && (
                <button
                    onClick={onToggleAssistant}
                    className={`p-2 rounded-full transition-colors ${isAssistantOpen ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    title="Bật/Tắt Trợ lý Co-pilot"
                    aria-label="Bật tắt Trợ lý AI Architect"
                    aria-pressed={isAssistantOpen}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                        <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                    </svg>
                </button>
            )}

            {/* Status Panel Toggle */}
            {onToggleStatusHUD && (
                <button
                    onClick={onToggleStatusHUD}
                    className={`p-2 rounded-full transition-colors ${isStatusHUDOpen ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    title="Bật/Tắt Giao diện Thẻ Nổi (Card HUD)"
                    aria-label="Bật tắt Giao diện Thẻ nổi"
                    aria-pressed={isStatusHUDOpen}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                </button>
            )}

            {/* Variables Inspector Toggle */}
            {onToggleHUD && (
                <button
                    onClick={onToggleHUD}
                    className={`p-2 rounded-full transition-colors ${isHUDOpen ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    title="Bật/Tắt Bảng Biến Số (Debug HUD)"
                    aria-label="Bật tắt Bảng gỡ lỗi biến số"
                    aria-pressed={isHUDOpen}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                </button>
            )}

            {/* Live Tuning Toggle (NEW) */}
            {onPresetChange && (
                <div className="relative">
                    <button
                        onClick={() => setIsTuningMenuOpen(!isTuningMenuOpen)}
                        className={`p-2 rounded-full transition-colors ${isTuningMenuOpen ? 'bg-fuchsia-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                        title="Live Tuning (Đổi Preset Nóng)"
                        aria-label="Mở menu chọn Preset nhanh"
                        aria-expanded={isTuningMenuOpen}
                    >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
                        </svg>
                    </button>
                    <PresetTuningModal 
                        isOpen={isTuningMenuOpen}
                        onClose={() => setIsTuningMenuOpen(false)}
                        activePresetName={activePresetName}
                        onPresetChange={onPresetChange}
                    />
                </div>
            )}

            {/* Visual Settings Toggle */}
            <div className="relative">
                <button 
                    ref={triggerRef}
                    onClick={() => setIsVisualMenuOpen(!isVisualMenuOpen)}
                    className={`p-2 rounded-full transition-colors ${isVisualMenuOpen ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    title="Cài đặt Giao diện & Âm thanh"
                    aria-label="Cài đặt Giao diện và Âm thanh"
                    aria-expanded={isVisualMenuOpen}
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                </button>
                <VisualSettingsModal 
                    isOpen={isVisualMenuOpen} 
                    onClose={handleCloseMenu}
                    visualState={visualState}
                    onUpdate={onVisualUpdate}
                />
            </div>

            {/* Immersive Toggle */}
            <button 
                onClick={() => setIsImmersive(!isImmersive)}
                className={`p-2 rounded-full transition-colors ${isImmersive ? 'text-sky-400 hover:text-sky-300' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                title={isImmersive ? "Thoát Chế độ Nhà hát" : "Chế độ Nhà hát (Immersive Mode)"}
                aria-label={isImmersive ? "Thoát chế độ nhà hát" : "Bật chế độ nhà hát"}
                aria-pressed={isImmersive}
            >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 011 1v1.586l2.293-2.293a1 1 0 011.414 1.414L5.414 15H7a1 1 0 010 2H3a1 1 0 01-1-1v-4a1 1 0 011-1zm13.707-1.293a1 1 0 00-1.414-1.414L13.586 15H12a1 1 0 000 2h4a1 1 0 001-1v-4z" clipRule="evenodd" /></svg>
            </button>
        </div>
    );
};


import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { fetchTtsBuffer, playNativeTts } from '../services/ttsService';
import { useToast } from '../components/ToastSystem';

// Options passed when queuing speech
interface TTSOptions {
    provider?: 'gemini' | 'native';
    rate?: number;
    pitch?: number;
}

interface QueueItem {
    id: string;
    text: string;
    voice: string;
    // THAY ĐỔI QUAN TRỌNG: Lưu trữ Promise thay vì chỉ text.
    // Điều này có nghĩa là việc tải xuống bắt đầu NGAY LẬP TỨC khi item được tạo.
    // Với Native TTS, biến này sẽ là undefined.
    audioPromise?: Promise<AudioBuffer>;
    // New fields for Native support
    provider: 'gemini' | 'native';
    rate: number;
    pitch: number;
}

interface TTSContextType {
    isPlaying: boolean;
    isPaused: boolean;
    autoPlayEnabled: boolean;
    queue: QueueItem[];
    currentPlayingId: string | null;
    isLoading: boolean;
    
    addToQueue: (text: string, voice: string, id?: string, options?: TTSOptions) => void;
    playImmediately: (text: string, voice: string, id?: string, options?: TTSOptions) => void;
    toggleAutoPlay: () => void;
    togglePause: () => void;
    skip: () => void;
    previous: () => void;
    stopAll: () => void;
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

export const TTSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
    const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const { showToast } = useToast();

    // Init Audio Context lazily
    const getContext = useCallback(async () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        return audioContextRef.current;
    }, []);

    // Core Play Function (Buffer - Gemini)
    const playBuffer = useCallback(async (buffer: AudioBuffer, id: string) => {
        const ctx = await getContext();
        
        // Stop any existing source just in case
        if (activeSourceRef.current) {
            try { activeSourceRef.current.stop(); } catch(e) {}
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        
        source.onended = () => {
            setIsPlaying(false);
            setCurrentPlayingId(null);
            activeSourceRef.current = null;
        };

        activeSourceRef.current = source;
        source.start();
        setIsPlaying(true);
        setCurrentPlayingId(id);
    }, [getContext]);

    // Process Queue Effect
    useEffect(() => {
        const processQueue = async () => {
            // Only process if not playing, not paused, not loading, and queue has items
            if (isPlaying || isPaused || isLoading || queue.length === 0) return;

            const nextItem = queue[0];
            setIsLoading(true); 

            try {
                if (nextItem.provider === 'native') {
                    // --- NATIVE HANDLING ---
                    // No buffer fetching needed. Play directly.
                    // IMPORTANT: playNativeTts is synchronous in setup but asynchronous in execution.
                    // We need to manage state via callbacks.
                    
                    setIsPlaying(true);
                    setCurrentPlayingId(nextItem.id);
                    setIsLoading(false); // Native loads instantly

                    playNativeTts(
                        nextItem.text, 
                        nextItem.voice, 
                        nextItem.rate, 
                        nextItem.pitch, 
                        () => {
                            // On Start
                        },
                        () => {
                            // On End
                            setIsPlaying(false);
                            setCurrentPlayingId(null);
                            // Only remove from queue after finishing
                            setQueue(prev => prev.slice(1));
                        }
                    );
                    // Return early so we don't execute buffer logic
                    return; 
                }

                // --- GEMINI HANDLING (Buffer) ---
                if (nextItem.audioPromise) {
                    const buffer = await nextItem.audioPromise;
                    
                    // Remove from queue ONLY after successful retrieval/wait (before playing starts)
                    setQueue(prev => prev.slice(1));
                    
                    // Play
                    await playBuffer(buffer, nextItem.id);
                }
            } catch (error) {
                console.error("TTS Queue Error:", error);
                // Nếu file này lỗi, báo lỗi và bỏ qua để sang file tiếp theo
                showToast(`Lỗi đọc: ${error instanceof Error ? error.message : String(error)}`, 'error');
                setQueue(prev => prev.slice(1));
            } finally {
                // For Native, isLoading is cleared inside the block. For Gemini, clear it here.
                if (nextItem.provider !== 'native') {
                    setIsLoading(false);
                }
            }
        };

        processQueue();
    }, [queue, isPlaying, isPaused, isLoading, playBuffer, showToast]);

    // Public Actions

    const addToQueue = useCallback((text: string, voice: string, id: string = `msg-${Date.now()}`, options: TTSOptions = {}) => {
        const provider = options.provider || 'gemini';
        
        let audioPromise: Promise<AudioBuffer> | undefined;

        // PRE-FETCHING: Gọi API ngay lập tức tại thời điểm thêm vào hàng đợi (chỉ với Gemini)
        if (provider === 'gemini') {
            audioPromise = fetchTtsBuffer(text, voice);
        }
        
        const newItem: QueueItem = { 
            id, 
            text, 
            voice,
            audioPromise,
            provider,
            rate: options.rate || 1,
            pitch: options.pitch || 1
        };
        
        setQueue(prev => [...prev, newItem]);
    }, []);

    const playImmediately = useCallback(async (text: string, voice: string, id: string = `now-${Date.now()}`, options: TTSOptions = {}) => {
        // 1. Clear Queue
        setQueue([]);
        
        // 2. Stop current audio (Buffer)
        if (activeSourceRef.current) {
            try { activeSourceRef.current.stop(); } catch(e) {}
        }
        // 3. Stop current audio (Native)
        window.speechSynthesis.cancel();

        setIsPlaying(false);
        setIsPaused(false);
        
        // 3. Add to queue (it will be picked up immediately by the effect)
        addToQueue(text, voice, id, options);
    }, [addToQueue]);

    const togglePause = useCallback(async () => {
        const ctx = await getContext();
        
        // Logic depends on what is currently playing or queued (check currentPlayingId)
        // Since we don't store which provider is currently playing in a separate state, 
        // we check both systems.
        
        if (isPaused) {
            // RESUME
            // Resume Context (Gemini)
            if (ctx.state === 'suspended') await ctx.resume();
            // Resume Native
            if (window.speechSynthesis.paused) window.speechSynthesis.resume();
            
            setIsPaused(false);
        } else {
            // PAUSE
            // Pause Context (Gemini)
            if (ctx.state === 'running') await ctx.suspend();
            // Pause Native
            if (window.speechSynthesis.speaking) window.speechSynthesis.pause();
            
            setIsPaused(true);
        }
    }, [getContext, isPaused]);

    const skip = useCallback(() => {
        // Skip Native
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel();
            // Canceling native triggers 'onend', which handles queue shifting
        }
        
        // Skip Buffer
        if (activeSourceRef.current) {
            try { activeSourceRef.current.stop(); } catch(e) {}
            // onended will trigger
        } else {
            // If loading
            if (isLoading && queue.length > 0) {
                 setQueue(prev => prev.slice(1));
                 setIsLoading(false);
            }
        }
    }, [isLoading, queue.length]);

    const previous = useCallback(async () => {
        console.log("Replay not fully supported in this version without buffer caching.");
    }, []);

    const stopAll = useCallback(() => {
        setQueue([]);
        
        // Stop Native
        window.speechSynthesis.cancel();
        
        // Stop Buffer
        if (activeSourceRef.current) {
            try { activeSourceRef.current.stop(); } catch(e) {}
        }
        
        setIsPlaying(false);
        setIsPaused(false);
        setIsLoading(false);
    }, []);

    const toggleAutoPlay = useCallback(() => {
        setAutoPlayEnabled(prev => !prev);
    }, []);

    return (
        <TTSContext.Provider value={{
            isPlaying,
            isPaused,
            autoPlayEnabled,
            queue,
            currentPlayingId,
            isLoading,
            addToQueue,
            playImmediately,
            toggleAutoPlay,
            togglePause,
            skip,
            previous,
            stopAll
        }}>
            {children}
        </TTSContext.Provider>
    );
};

export const useTTS = () => {
    const context = useContext(TTSContext);
    if (context === undefined) {
        throw new Error('useTTS must be used within a TTSProvider');
    }
    return context;
};
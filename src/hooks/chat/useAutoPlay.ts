
import { useEffect } from 'react';
import type { ChatMessage, SillyTavernPreset } from '../../types';

interface UseAutoPlayProps {
    isAutoLooping: boolean;
    isGenerating: boolean;
    isScanning: boolean;
    isSummarizing: boolean;
    messages: ChatMessage[];
    sendMessage: (content: string) => void;
    preset: SillyTavernPreset | null;
}

export const useAutoPlay = ({
    isAutoLooping,
    isGenerating,
    isScanning,
    isSummarizing,
    messages,
    sendMessage,
    preset
}: UseAutoPlayProps) => {

    useEffect(() => {
        if (!isAutoLooping || isGenerating || isScanning || isSummarizing || messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];

        if (lastMessage.role === 'model') {
            const rawContent = lastMessage.originalRawContent || lastMessage.content || "";
            
            // Extract CHOICE blocks
            // Updated Regex to support standard quotes, smart quotes, and asian brackets
            const choiceRegex = /\[CHOICE:\s*(?:["'“「])(.*?)(?:["'”」])\s*\]/gi;
            
            const choices: string[] = [];
            let match;
            while ((match = choiceRegex.exec(rawContent)) !== null) {
                if (match[1]) {
                    choices.push(match[1].trim());
                }
            }

            let nextPrompt = "";

            if (choices.length > 0) {
                const randomIndex = Math.floor(Math.random() * choices.length);
                nextPrompt = choices[randomIndex];
            } else {
                nextPrompt = preset?.continue_nudge_prompt || "[Tiếp tục...]";
            }

            // Minimal delay to allow UI to update before sending next request
            const timer = setTimeout(() => {
                sendMessage(nextPrompt);
            }, 100);
            
            return () => clearTimeout(timer);
        }
    }, [isAutoLooping, isGenerating, isScanning, isSummarizing, messages, sendMessage, preset]);
};

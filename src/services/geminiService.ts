
import { GenerateContentResponse } from "@google/genai";
import type { SillyTavernPreset } from '../types';
import { getConnectionSettings, getProxyUrl, getProxyPassword, getProxyLegacyMode } from './settingsService';
import { callGeminiDirect, getGeminiClient, buildGeminiPayload } from './api/geminiApi';
import { callOpenRouter } from './api/openRouterApi';
import { callProxy } from './api/proxyApi';

const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

/**
 * Main Dispatcher: Điều hướng yêu cầu dựa trên Connection Settings
 */
export async function sendChatRequest(
    fullPrompt: string,
    settings: SillyTavernPreset
): Promise<{ response: GenerateContentResponse }> {
    const connection = getConnectionSettings();
    const source = connection.source;

    if (source === 'proxy') {
        const text = await callProxy(connection.proxy_model, fullPrompt, settings);
        return { response: { text } as GenerateContentResponse };
    }

    if (source === 'openrouter') {
        const text = await callOpenRouter(connection.openrouter_model, fullPrompt, settings);
        return { response: { text } as GenerateContentResponse };
    }

    const model = connection.gemini_model || 'gemini-3-pro-preview';
    const response = await callGeminiDirect(model, fullPrompt, settings, safetySettings);
    return { response };
}

/**
 * Unified Streaming Logic with Abort Signal Support
 */
export async function* sendChatRequestStream(
    fullPrompt: string,
    settings: SillyTavernPreset,
    signal?: AbortSignal // NEW: Abort Signal
): AsyncGenerator<string, void, unknown> {
    const connection = getConnectionSettings();
    
    // Nếu source không phải gemini native, fallback về request thường (giả lập stream)
    if (connection.source !== 'gemini') {
        if (signal?.aborted) throw new Error("Aborted");
        const result = await sendChatRequest(fullPrompt, settings);
        yield result.response.text || "";
        return;
    }

    const ai = getGeminiClient();
    const model = connection.gemini_model || 'gemini-3-pro-preview';
    const payload = buildGeminiPayload(fullPrompt, settings, safetySettings);

    try {
        const streamResponse = await ai.models.generateContentStream({
            model,
            contents: payload.contents,
            config: payload.config,
        });

        // Gemini SDK hiện tại chưa hỗ trợ trực tiếp signal trong generateContentStream ở level thấp,
        // nhưng chúng ta có thể kiểm tra signal trong vòng lặp.
        for await (const chunk of streamResponse) {
            if (signal?.aborted) {
                // User pressed stop
                break; 
            }
            yield chunk.text || "";
        }
    } catch (error) {
        if (signal?.aborted) {
            // Quietly exit if aborted
            return;
        }
        console.error("Streaming Error:", error);
        throw new Error("Lỗi luồng dữ liệu AI.");
    }
}

// Re-exporting OpenRouter members for UI
export { validateOpenRouterKey, getOpenRouterModels } from './api/openRouterApi';

// Re-export nghiệp vụ
export * from './ai/semanticTasks';


import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import type { CharacterCard, SillyTavernPreset, Lorebook, ChatMessage, OpenRouterModel } from '../types';
import { getActiveModel, getApiKey, getOpenRouterApiKey, getProxyUrl, getProxyPassword, getProxyLegacyMode, getProxyForTools, getConnectionSettings } from './settingsService';
import { cleanMessageContent } from './promptManager';
import defaultPreset from '../data/defaultPreset';

const safetySettings = [
    {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
    },
];

// Hàm trợ giúp để lấy một máy khách Gemini đã được cấu hình
const getGeminiClient = (): GoogleGenAI => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API Key không được định cấu hình. Vui lòng đặt nó trong Cài đặt API hoặc cấu hình môi trường của ứng dụng.");
    }
    return new GoogleGenAI({ apiKey });
};

// --- HELPER: Construct Gemini Payload (Shared) ---
const buildGeminiPayload = (fullPrompt: string, settings: SillyTavernPreset) => {
    const generationConfig: any = {
        temperature: settings.temp,
        topP: settings.top_p,
        topK: settings.top_k,
        maxOutputTokens: settings.max_tokens,
        stopSequences: settings.stopping_strings,
    };

    if (settings.thinking_budget && Number(settings.thinking_budget) > 0) {
        generationConfig.thinkingConfig = { thinkingBudget: Number(settings.thinking_budget) };
    }

    // FIX: contents must be an array for REST API
    return {
        contents: [{
            role: "user",
            parts: [{ text: fullPrompt }]
        }],
        safetySettings: safetySettings, 
        generationConfig: generationConfig
    };
};

// --- PROXY HELPER FUNCTION ---
/**
 * Generic function to call an OpenAI-compatible Proxy.
 * Used for auxiliary tasks (summary, scan, translate) when Proxy Mode is enforced.
 */
async function callOpenAIProxy(prompt: string, model: string): Promise<string> {
    const proxyUrl = getProxyUrl();
    const proxyPassword = getProxyPassword();
    const isLegacyMode = getProxyLegacyMode();
    const conn = getConnectionSettings();

    if (!proxyUrl) throw new Error("Proxy URL chưa được cấu hình.");

    const cleanUrl = proxyUrl.trim().replace(/\/$/, '');
    
    // --- SPECIAL HANDLING FOR GOOGLE NATIVE PROTOCOL IN PROXY ---
    if (conn.proxy_protocol === 'google_native') {
        const apiKey = getApiKey() || 'placeholder'; // Browser proxy might need key
        const endpoint = `${cleanUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        // FIX: Correct JSON structure for REST API (contents must be an array)
        const payload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            safetySettings: safetySettings,
            generationConfig: {
                temperature: 0.1, // Task temp
            }
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Proxy Google Native Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        // Extract text from Gemini response structure
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // --- STANDARD OPENAI PROTOCOL ---
    const endpoint = `${cleanUrl}/v1/chat/completions`;
    const targetModel = model || 'gemini-3-flash-preview';

    const payload = {
        model: targetModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.1 // Low temp for tasks
    };

    const headers: Record<string, string> = {};
    if (isLegacyMode) {
        headers['Content-Type'] = 'text/plain';
    } else {
        headers['Content-Type'] = 'application/json';
        if (proxyPassword) {
            headers['Authorization'] = `Bearer ${proxyPassword}`;
        }
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Proxy Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
}


export async function summarizeHistory(historySlice: ChatMessage[], cardName: string, customPrompt?: string): Promise<string> {
  const historyText = historySlice.map(msg => {
    const rawContent = msg.content || msg.originalRawContent || '';
    const cleanContent = cleanMessageContent(rawContent);
    
    if (!cleanContent.trim()) return null; 

    if (msg.role === 'user') return `User: ${cleanContent}`;
    return `${cardName}: ${cleanContent}`;
  }).filter(Boolean).join('\n');
  
  let prompt = "";
  
  if (customPrompt) {
      prompt = customPrompt
        .replace('{{chat_history_slice}}', historyText)
        .replace(/{{char}}/g, cardName);
  } else {
      prompt = `
Bạn là **Thư Ký Ghi Chép (The Chronicler)** của thế giới này. Nhiệm vụ của bạn là cô đọng 'Trí Nhớ Dài Hạn' từ đoạn hội thoại vừa qua để lưu trữ.

**QUY TẮC TÓM TẮT:**
1.  **Độ dài:** Bắt buộc trong khoảng **500 đến 1000 ký tự**.
2.  **Giọng văn:** **Trung lập, Khách quan, Ngôi thứ 3**. Tuyệt đối không dùng cảm xúc cá nhân của bạn để đánh giá. Viết như một biên bản sự kiện hoặc nhật ký hành trình khách quan.
3.  **Nội dung ưu tiên:**
    *   Các hành động và sự kiện chính đã diễn ra giữa ${cardName} và User.
    *   Sự thay đổi quan trọng trong trạng thái nhân vật (vết thương, cảm xúc, mối quan hệ, xung đột).
    *   Các vật phẩm, thông tin bí mật hoặc địa điểm mới được phát hiện.
4.  **Loại bỏ:** Các câu chào hỏi xã giao (xin chào, tạm biệt), các chi tiết lặp lại vô nghĩa hoặc rườm rà.

Đoạn hội thoại cần ghi chép:
---
${historyText}
---

Bản Ghi Chép (Tóm tắt):
  `;
  }

  try {
    // --- DUAL DRIVER LOGIC ---
    if (getProxyForTools()) {
        const conn = getConnectionSettings();
        const model = conn.proxy_tool_model || conn.proxy_model || 'gemini-3-flash-preview';
        return await callOpenAIProxy(prompt, model);
    } else {
        // GOOGLE DIRECT PATH
        const ai = getGeminiClient();
        const conn = getConnectionSettings();
        const model = conn.gemini_model || 'gemini-3-flash-preview';
        
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { safetySettings },
        });
        return response.text?.trim() || "";
    }
  } catch (error) {
    console.error("Gemini/Proxy API error in summarizeHistory:", error);
    return ""; 
  }
}

/**
 * Sends the constructed prompt to the selected API (Gemini or OpenRouter).
 * UPDATED: Uses Global Connection Settings instead of Preset Source.
 */
export async function sendChatRequest(
    fullPrompt: string,
    settings: SillyTavernPreset
): Promise<{ response: GenerateContentResponse }> {
    
    // --- GLOBAL CONNECTION SETTINGS ---
    const connection = getConnectionSettings();
    const source = connection.source;

    // 1. REVERSE PROXY
    if (source === 'proxy') {
        const proxyUrl = getProxyUrl();
        const proxyPassword = getProxyPassword();
        const isLegacyMode = getProxyLegacyMode();
        const model = connection.proxy_model || 'gemini-3-pro-preview';
        const cleanUrl = proxyUrl.trim().replace(/\/$/, '');

        // --- A. GOOGLE NATIVE PROTOCOL ---
        if (connection.proxy_protocol === 'google_native') {
            const apiKey = getApiKey() || ''; // Appends key for browser proxy
            const endpoint = `${cleanUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
            
            // Build Native Payload
            const payload = buildGeminiPayload(fullPrompt, settings);

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Google Native Proxy Error (${response.status}): ${errorText}`);
                }

                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                
                // Return in SDK format
                return { response: { text } as GenerateContentResponse };

            } catch (error) {
                console.error("Google Native Proxy error:", error);
                throw error;
            }
        }

        // --- B. OPENAI COMPATIBLE PROTOCOL ---
        const endpoint = `${cleanUrl}/v1/chat/completions`; 
        try {
            const payload = {
                model: model,
                messages: [
                    { role: 'user', content: fullPrompt }
                ],
                temperature: Number(settings.temp) || 1,
                top_p: Number(settings.top_p) || 1,
                top_k: Number(settings.top_k) || 40,
                max_tokens: Number(settings.max_tokens) || 4096,
                stop: settings.stopping_strings && settings.stopping_strings.length > 0 ? settings.stopping_strings : undefined,
                stream: false
            };

            const headers: Record<string, string> = {};

            if (isLegacyMode) {
                headers['Content-Type'] = 'text/plain';
            } else {
                headers['Content-Type'] = 'application/json';
                if (proxyPassword) {
                    headers['Authorization'] = `Bearer ${proxyPassword}`;
                }
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Proxy Error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
            
            return { response: { text } as GenerateContentResponse };

        } catch (error) {
            console.error("Proxy API error:", error);
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Lỗi kết nối Proxy: ${msg}`);
        }
    }

    // 2. OPEN ROUTER
    if (source === 'openrouter') {
        const openRouterKey = getOpenRouterApiKey();
        if (!openRouterKey) {
            throw new Error("API Key của OpenRouter chưa được đặt. Vui lòng đặt nó trong Cài đặt API.");
        }
        
        const model = connection.openrouter_model;
        if (!model) {
             throw new Error("Chưa chọn Model cho OpenRouter. Vui lòng chọn trong Cài đặt API.");
        }

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openRouterKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'SillyTavern Card Studio'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: fullPrompt }],
                    temperature: settings.temp,
                    top_p: settings.top_p,
                    top_k: settings.top_k,
                    max_tokens: settings.max_tokens,
                    repetition_penalty: settings.repetition_penalty,
                    stop: settings.stopping_strings && settings.stopping_strings.length > 0 ? settings.stopping_strings : undefined,
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`OpenRouter API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            const text = data.choices[0]?.message?.content || '';
            const apiResponse = { text } as GenerateContentResponse;
            return { response: apiResponse };

        } catch (error) {
            console.error("OpenRouter API error:", error);
            throw new Error(`Không thể tạo phản hồi từ OpenRouter. ${error instanceof Error ? error.message : 'Vui lòng kiểm tra API key và kết nối mạng.'}`);
        }

    } 
    
    // 3. DEFAULT (GEMINI DIRECT)
    else {
        // --- Default Gemini Logic ---
        const ai = getGeminiClient();
        const model = connection.gemini_model || 'gemini-3-pro-preview';

        try {
            // Xây dựng config với thinkingConfig (nếu có)
            const config: any = {
                safetySettings,
                temperature: settings.temp,
                topP: settings.top_p,
                topK: settings.top_k,
                maxOutputTokens: settings.max_tokens,
                stopSequences: settings.stopping_strings,
            };

            // Inject Thinking Config nếu budget > 0
            if (settings.thinking_budget && Number(settings.thinking_budget) > 0) {
                config.thinkingConfig = { thinkingBudget: Number(settings.thinking_budget) };
            }

            const response = await ai.models.generateContent({
                model: model,
                contents: fullPrompt,
                config: config,
            });

            // --- NATIVE THINKING EXTRACTION ---
            if (settings.thinking_budget && Number(settings.thinking_budget) > 0) {
                const parts = response.candidates?.[0]?.content?.parts || [];
                let thoughtContent = '';
                let finalContent = '';

                for (const part of parts) {
                    if ((part as any).thought) {
                        thoughtContent += part.text;
                    } else {
                        finalContent += part.text;
                    }
                }

                if (thoughtContent) {
                    const combinedText = `<thinking>${thoughtContent}</thinking>\n${finalContent}`;
                    Object.defineProperty(response, 'text', {
                        get: () => combinedText,
                        configurable: true
                    });
                }
            }
            // ----------------------------------

            return { response };
        } catch (error) {
            console.error("Gemini API error in sendChatRequest:", error);
            throw new Error("Không thể tạo phản hồi từ Gemini. Vui lòng kiểm tra API key, mạng, hoặc sự hỗ trợ model (Thinking Config).");
        }
    }
}

/**
 * Parses Gemini's JSON stream format
 * Expects chunks like: [{ "candidates": ... }] or , { "candidates": ... }
 */
async function* streamGeminiNativeViaProxy(
    fullPrompt: string, 
    settings: SillyTavernPreset,
    proxyUrl: string,
    model: string,
    apiKey: string
): AsyncGenerator<string, void, unknown> {
    const cleanUrl = proxyUrl.trim().replace(/\/$/, '');
    const endpoint = `${cleanUrl}/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`; // Request SSE if supported, or handle standard stream
    
    // Build Native Payload
    const payload = buildGeminiPayload(fullPrompt, settings);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(`Google Native Stream Error (${response.status}): ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            // Basic JSON Stream Parser
            // Gemini Stream returns an array of JSON objects, sometimes comma separated, sometimes wrapped in [ ]
            // We'll try to extract valid JSON objects from the buffer.
            
            // Simple heuristic: split by newlines (SSE style) or scan for balanced braces
            // Assuming the proxy returns standard SSE "data: {...}" or raw JSON chunks
            
            // Try standard SSE parsing first
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                
                let jsonStr = trimmed;
                if (trimmed.startsWith('data: ')) {
                    jsonStr = trimmed.slice(6);
                }
                
                // Cleanup JSON array artifacts if raw stream
                if (jsonStr === '[' || jsonStr === ']' || jsonStr === ',') continue;
                if (jsonStr.startsWith(',')) jsonStr = jsonStr.slice(1);

                try {
                    const data = JSON.parse(jsonStr);
                    const chunkText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (chunkText) {
                        yield chunkText;
                    }
                } catch (e) {
                    // Not valid JSON yet, might be split across chunks?
                    // For robustness, in a complex proxy, proper JSON parser is needed.
                    // Here we assume well-formed line chunks from proxy.
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * Handles OpenAI-compatible streaming (Server-Sent Events)
 * Used for Proxy and OpenRouter.
 */
async function* streamOpenAICompatible(
    fullPrompt: string, 
    settings: SillyTavernPreset,
    connectionSource: 'proxy' | 'openrouter',
    connectionModel: string
): AsyncGenerator<string, void, unknown> {
    let url = '';
    let headers: Record<string, string> = {};
    let model = connectionModel;

    // 1. Configuration
    if (connectionSource === 'proxy') {
        const proxyUrl = getProxyUrl();
        const proxyPassword = getProxyPassword();
        const isLegacyMode = getProxyLegacyMode();
        
        const cleanUrl = proxyUrl.trim().replace(/\/$/, '');
        url = `${cleanUrl}/v1/chat/completions`;
        
        if (isLegacyMode) {
            headers = { 'Content-Type': 'text/plain' }; 
        } else {
            headers = { 'Content-Type': 'application/json' };
            if (proxyPassword) {
                headers['Authorization'] = `Bearer ${proxyPassword}`;
            }
        }
    } else {
        // OpenRouter
        const openRouterKey = getOpenRouterApiKey();
        if (!openRouterKey) throw new Error("API Key OpenRouter bị thiếu.");
        url = "https://openrouter.ai/api/v1/chat/completions";
        headers = {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'SillyTavern Card Studio'
        };
    }

    // 2. Request
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: fullPrompt }],
            temperature: Number(settings.temp) || 1,
            top_p: Number(settings.top_p) || 1,
            top_k: Number(settings.top_k) || 40,
            max_tokens: Number(settings.max_tokens) || 4096,
            stop: settings.stopping_strings && settings.stopping_strings.length > 0 ? settings.stopping_strings : undefined,
            stream: true // Enable Streaming
        })
    });

    if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(`Streaming Error (${response.status}): ${text}`);
    }

    // 3. SSE Parser
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; 

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.startsWith('data: ')) {
                    const dataStr = trimmed.slice(6);
                    if (dataStr === '[DONE]') return; 

                    try {
                        const json = JSON.parse(dataStr);
                        const content = json.choices?.[0]?.delta?.content || '';
                        if (content) {
                            yield content;
                        }
                    } catch (e) {
                        // Ignore
                    }
                }
            }
        }
    } catch (e) {
        console.error("Stream reading error:", e);
        throw new Error("Mất kết nối khi đang Stream dữ liệu.");
    } finally {
        reader.releaseLock();
    }
}

/**
 * Sends a STREAMING chat request.
 * Returns an Async Generator that yields chunks of text.
 * UPDATED: Uses Global Connection Settings.
 */
export async function* sendChatRequestStream(
    fullPrompt: string,
    settings: SillyTavernPreset
): AsyncGenerator<string, void, unknown> {
    
    const connection = getConnectionSettings();
    const source = connection.source;

    // --- 1. PROXY STREAMING ---
    if (source === 'proxy') {
        const proxyUrl = getProxyUrl();
        const model = connection.proxy_model || 'gemini-3-pro-preview';

        // Branch based on protocol
        if (connection.proxy_protocol === 'google_native') {
            const apiKey = getApiKey() || '';
            yield* streamGeminiNativeViaProxy(fullPrompt, settings, proxyUrl, model, apiKey);
        } else {
            // OpenAI Standard
            yield* streamOpenAICompatible(fullPrompt, settings, 'proxy', model);
        }
        return;
    }
    
    // --- 2. OPENROUTER STREAMING ---
    if (source === 'openrouter') {
        if (!connection.openrouter_model) throw new Error("Chưa chọn model OpenRouter.");
        yield* streamOpenAICompatible(fullPrompt, settings, 'openrouter', connection.openrouter_model);
        return;
    }

    // --- 3. GEMINI DIRECT STREAMING ---
    const ai = getGeminiClient();
    const model = connection.gemini_model || 'gemini-3-pro-preview';
    
    const config: any = {
        safetySettings,
        temperature: settings.temp,
        topP: settings.top_p,
        topK: settings.top_k,
        maxOutputTokens: settings.max_tokens,
        stopSequences: settings.stopping_strings,
    };

    if (settings.thinking_budget && Number(settings.thinking_budget) > 0) {
        config.thinkingConfig = { thinkingBudget: Number(settings.thinking_budget) };
    }

    try {
        const streamResponse = await ai.models.generateContentStream({
            model: model,
            contents: fullPrompt,
            config: config,
        });

        for await (const chunk of streamResponse) {
            const parts = chunk.candidates?.[0]?.content?.parts || [];
            let chunkText = '';
            
            if (parts.length > 0) {
                for (const part of parts) {
                    if ((part as any).thought) {
                        chunkText += `<thinking>${part.text}</thinking>`; 
                    } else {
                        chunkText += part.text;
                    }
                }
            } else {
                chunkText = chunk.text || '';
            }
            
            yield chunkText;
        }
    } catch (error) {
        console.error("Gemini Streaming API error:", error);
        throw new Error("Lỗi khi stream từ Gemini. Vui lòng kiểm tra kết nối.");
    }
}


export async function generateLorebookEntry(
  keyword: string,
  chatMessages: ChatMessage[],
  longTermSummaries: string[],
  existingLorebooks: Lorebook[]
): Promise<string> {
  // 1. Format Chat Context
  const longTermSummaryString = longTermSummaries.length > 0
    ? longTermSummaries.join('\n\n---\n\n')
    : "Không có tóm tắt dài hạn.";

  const recentHistoryString = chatMessages.map(msg => {
    const role = msg.role === 'user' ? 'User' : (chatMessages.find(c => c.role === 'model')?.originalRawContent?.split(':')[0] || 'Model');
    return `${role}: ${msg.content || msg.originalRawContent || ''}`;
  }).join('\n');

  // 2. Format Existing Lorebooks for reference
  const lorebookReferenceString = existingLorebooks.map(lb => {
    const entriesString = lb.book.entries.map(entry => {
      return `- ${entry.keys.join(', ')}: ${entry.content}`;
    }).join('\n');
    return `Sổ tay: ${lb.name}\n${entriesString}`;
  }).join('\n\n');

  const prompt = `
Bạn là một AI chuyên viết kiến thức nền (lore) cho thế giới giả tưởng, hoạt động như một người ghi chép bách khoa toàn thư. Nhiệm vụ của bạn là viết một mục Sổ tay chi tiết và nhất quán cho 'Từ khóa' được cung cấp.

Hãy sử dụng toàn bộ 'Ngữ cảnh Hội thoại' để hiểu các sự kiện đã diễn ra và dùng 'Tham khảo Sổ tay Hiện có' để bắt chước văn phong, định dạng và mức độ chi tiết đã có.

---

**Từ khóa cần viết:** ${keyword}

---

**A. Ngữ cảnh Hội thoại (Trí nhớ):**

**1. Tóm tắt Dài hạn:**
${longTermSummaryString}

**2. Lịch sử Hội thoại Gần đây:**
${recentHistoryString}

---

**B. Tham khảo Sổ tay Hiện có (Để tham khảo văn phong và tính nhất quán):**
${lorebookReferenceString || "Chưa có sổ tay nào để tham khảo."}

---

**NỘI DUNG MỤC SỔ TAY MỚI (Bắt đầu viết từ đây):**
**CHỈ trả về nội dung mô tả, không thêm bất kỳ lời bình luận hay định dạng nào khác.**
`;

  try {
    // --- DUAL DRIVER LOGIC ---
    if (getProxyForTools()) {
        const conn = getConnectionSettings();
        // Priority: Tool Model -> Chat Model -> Default
        const model = conn.proxy_tool_model || conn.proxy_model || 'gemini-2.5-flash';
        return await callOpenAIProxy(prompt, model);
    } else {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
            model: getActiveModel(), // Helper now returns correct model ID based on source
            contents: prompt,
            config: { safetySettings },
        });
        return response.text?.trim() || '';
    }
  } catch (error) {
    console.error("Gemini API error in generateLorebookEntry:", error);
    throw new Error("Không thể tạo mục sổ tay. Vui lòng kiểm tra API key/Proxy và kết nối mạng.");
  }
}

export async function getOpenRouterModels(): Promise<OpenRouterModel[]> {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/models");

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || `Lỗi HTTP: ${response.status}`;
            throw new Error(`Không thể lấy danh sách mô hình từ OpenRouter: ${errorMessage}`);
        }

        const data = await response.json();
        if (!data || !Array.isArray(data.data)) {
            throw new Error("Phản hồi API từ OpenRouter có định dạng không hợp lệ.");
        }

        data.data.sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name));

        return data.data;

    } catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('Failed to fetch')) {
                 throw new Error("Lỗi mạng khi cố gắng kết nối với OpenRouter. Vui lòng kiểm tra kết nối internet của bạn.");
            }
            throw error;
        }
        throw new Error("Đã xảy ra lỗi không xác định khi lấy các mô hình OpenRouter.");
    }
}

export async function validateOpenRouterKey(apiKey: string): Promise<boolean> {
    if (!apiKey) {
        throw new Error("API Key không được để trống.");
    }
    try {
        const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                const errorData = await response.json().catch(() => ({ error: {} }));
                if (errorData.error?.code === 'user_not_found') {
                     throw new Error("Khóa API OpenRouter không hợp lệ (Không tìm thấy người dùng).");
                }
                throw new Error("Khóa API OpenRouter không hợp lệ hoặc đã bị thu hồi.");
            }
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || `Lỗi HTTP: ${response.status}`;
            throw new Error(`Xác thực không thành công: ${errorMessage}`);
        }

        const data = await response.json();
        return !!data.data;

    } catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('Failed to fetch')) {
                 throw new Error("Lỗi mạng khi xác thực khóa. Vui lòng kiểm tra kết nối internet của bạn.");
            }
            throw error;
        }
        throw new Error("Đã xảy ra lỗi không xác định trong quá trình xác thực khóa.");
    }
}

// --- NEW FUNCTION: SMART SCAN (Updated with Global Macro Replacement and Robust Parsing) ---

// Helper to extract JSON from potential messy text
function extractAndParseJson(text: string): any {
    try {
        return JSON.parse(text);
    } catch (e) {
        // Continue
    }

    try {
        const cleanMarkdown = text.replace(/```(?:json)?|```/g, '').trim();
        return JSON.parse(cleanMarkdown);
    } catch (e) {
        // Continue
    }

    try {
        const firstOpen = text.indexOf('{');
        const lastClose = text.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            const potentialJson = text.substring(firstOpen, lastClose + 1);
            return JSON.parse(potentialJson);
        }
    } catch (e) {
        // Continue
    }
    
    try {
        const firstOpen = text.indexOf('[');
        const lastClose = text.lastIndexOf(']');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            const potentialJson = text.substring(firstOpen, lastClose + 1);
            return JSON.parse(potentialJson);
        }
    } catch (e) {
        // Continue
    }

    throw new Error("Could not parse JSON from response.");
}

export async function scanWorldInfoWithAI(
    combinedContext: string, 
    contextList: string, 
    candidateList: string, 
    latestInput: string, 
    stateString: string, 
    modelName: string = 'gemini-2.5-flash',
    customSystemPrompt?: string
): Promise<{selectedIds: string[], outgoingPrompt: string, rawResponse: string}> {
    
    const baseSystemPrompt = customSystemPrompt || defaultPreset.smart_scan_system_prompt || '';
    
    const finalPrompt = baseSystemPrompt
        .replace(/{{context}}/g, contextList || '(Không có)')
        .replace(/{{state}}/g, stateString || '(Không có)')
        .replace(/{{history}}/g, combinedContext || '(Không có)') 
        .replace(/{{input}}/g, latestInput || '(Không có)')
        .replace(/{{candidates}}/g, candidateList || '(Không có)');

    let text = '{}';

    try {
        // --- DUAL DRIVER LOGIC ---
        if (getProxyForTools()) {
            // PROXY MODE
            const conn = getConnectionSettings();
            // Allow override via modelName param if passed, but default to tool model setting
            // Note: SmartScan calls pass 'gemini-2.5-flash' as fallback modelName usually.
            // We should prefer the setting `proxy_tool_model` if set.
            const targetModel = conn.proxy_tool_model || conn.proxy_model || modelName;
            text = await callOpenAIProxy(finalPrompt, targetModel);
        } else {
            // GOOGLE DIRECT MODE (Try to use modelName if provided, else fallback to active gemini model)
            // SmartScan usually requests specific models (like Flash).
            
            const ai = getGeminiClient();
            const response = await ai.models.generateContent({
                model: modelName, 
                contents: finalPrompt,
                config: {
                    temperature: 0, 
                    responseMimeType: 'application/json',
                    safetySettings,
                },
            });
            text = response.text || '{}';
        }

        let selectedIds: string[] = [];
        
        try {
            const parsed = extractAndParseJson(text);
            if (Array.isArray(parsed)) {
                selectedIds = parsed;
            } else if (parsed.selected_ids && Array.isArray(parsed.selected_ids)) {
                selectedIds = parsed.selected_ids;
            }
        } catch (e) {
            console.error("Failed to parse JSON from Smart Scan:", text);
        }
        
        return { 
            selectedIds, 
            outgoingPrompt: finalPrompt, 
            rawResponse: text 
        };

    } catch (error) {
        console.error("Gemini/Proxy API error in scanWorldInfoWithAI:", error);
        return { selectedIds: [], outgoingPrompt: finalPrompt, rawResponse: String(error) };
    }
}

/**
 * TRANSLATE LOREBOOK BATCH
 */
export async function translateLorebookBatch(
    entries: any[], 
    customPromptTemplate: string,
    model: string = 'gemini-3-flash-preview' 
): Promise<{ entries: any[], rawResponse: string, finalPrompt: string }> {
    
    const minifiedEntries = entries.map(e => ({
        uid: e.uid,
        keys: e.keys,
        comment: e.comment,
        content: e.content
    }));

    const jsonString = JSON.stringify(minifiedEntries);
    const finalPrompt = customPromptTemplate.replace('{{json_data}}', jsonString);

    let responseText = "";

    try {
        // --- DUAL DRIVER LOGIC ---
        if (getProxyForTools()) {
            // PROXY MODE
            const conn = getConnectionSettings();
            // Allow override via 'model' param (passed from UI), or fallback to settings
            const targetModel = conn.proxy_tool_model || conn.proxy_model || model;
            responseText = await callOpenAIProxy(finalPrompt, targetModel);
        } else {
            // GOOGLE DIRECT MODE
            const ai = getGeminiClient();
            const response = await ai.models.generateContent({
                model: model,
                contents: finalPrompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                uid: { type: Type.STRING },
                                keys: { type: Type.ARRAY, items: { type: Type.STRING } },
                                comment: { type: Type.STRING },
                                content: { type: Type.STRING },
                            },
                            required: ["uid", "keys", "comment", "content"],
                        },
                    },
                    safetySettings,
                    temperature: 0.1 
                },
            });
            responseText = response.text || "[]";
        }

        let translatedEntries = extractAndParseJson(responseText);
        
        if (!Array.isArray(translatedEntries)) {
            if (translatedEntries.entries) translatedEntries = translatedEntries.entries;
            else if (translatedEntries.data) translatedEntries = translatedEntries.data;
            else throw new Error("AI trả về định dạng JSON không phải là mảng.");
        }

        return { entries: translatedEntries, rawResponse: responseText, finalPrompt };

    } catch (error: any) {
        console.error("Gemini/Proxy API error in translateLorebookBatch:", error);
        throw {
            message: error.message || String(error),
            rawResponse: responseText || "(Không có phản hồi hoặc lỗi mạng)",
            finalPrompt: finalPrompt
        };
    }
}

/**
 * BATCH TRANSLATE GREETINGS
 */
export async function translateGreetingsBatch(
    data: {
        first_mes: string;
        alternate_greetings: string[];
        group_only_greetings: string[];
    },
    context: {
        name: string;
        description: string;
    },
    model: string = 'gemini-3-flash-preview'
) {
    const prompt = `
Bạn là một dịch giả tiểu thuyết chuyên nghiệp. Nhiệm vụ của bạn là dịch các lời chào nhân vật sau sang tiếng Việt.

**THÔNG TIN NHÂN VẬT (Ngữ cảnh):**
- Tên: ${context.name}
- Mô tả: ${context.description}

**QUY TẮC DỊCH THUẬT:**
1. **Phong cách:** Dựa vào 'Mô tả' nhân vật để chọn giọng văn phù hợp (Cổ trang, Hiện đại, Lạnh lùng, Dễ thương...).
2. **Xưng hô:** Chọn đại từ nhân xưng (Ta/Nàng, Anh/Em, Tôi/Cậu...) nhất quán xuyên suốt tất cả các lời chào.
3. **Kỹ thuật:**
   - Giữ nguyên các biến trong ngoặc nhọn: {{user}}, {{char}}.
   - Giữ nguyên các thẻ HTML hoặc script nếu có.
   - Dịch thoát ý, tự nhiên, văn học, tránh dịch word-by-word.
4. **Định dạng:** Trả về JSON đúng cấu trúc đầu vào. KHÔNG thay đổi tên trường (keys).

**QUAN TRỌNG:** 
- Nếu dữ liệu đầu vào là mảng rỗng [], hãy trả về mảng rỗng [].
- Chỉ trả về chuỗi JSON thuần túy, không kèm theo markdown (block code).

**DỮ LIỆU CẦN DỊCH:**
${JSON.stringify(data, null, 2)}
`;

    let text = "{}";

    try {
        // --- DUAL DRIVER LOGIC ---
        if (getProxyForTools()) {
            const conn = getConnectionSettings();
            // Priority: Tool Model -> Chat Model -> Default
            const targetModel = conn.proxy_tool_model || conn.proxy_model || model;
            text = await callOpenAIProxy(prompt, targetModel);
        } else {
            const ai = getGeminiClient();
            const response = await ai.models.generateContent({
                model: model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    safetySettings,
                }
            });
            text = response.text || "{}";
        }
        
        return extractAndParseJson(text);

    } catch (error: any) {
        console.error("Greeting Translation Error:", error);
        throw new Error(error.message || "Lỗi dịch thuật từ AI.");
    }
}

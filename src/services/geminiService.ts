
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import type { CharacterCard, EnhancementField, SillyTavernPreset, Lorebook, ChatMessage, OpenRouterModel } from '../types';
import { getActiveModel, getApiKey, getOpenRouterApiKey, getProxyUrl } from './settingsService';
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


export async function analyzeCard(card: CharacterCard): Promise<string> {
  const cardJson = JSON.stringify(card, null, 2);
  const ai = getGeminiClient();

  const prompt = `
Bạn là một chuyên gia tạo nhân vật cho trò chơi nhập vai AI theo định dạng SillyTavern.
Hãy phân tích tệp JSON của thẻ nhân vật SillyTavern đầy đủ dưới đây. Dữ liệu này bao gồm các trường cốt lõi, kịch bản, Sổ tay Thế giới (char_book) và các siêu dữ liệu khác.

Cung cấp một bản tóm tắt ngắn gọn, điểm chất lượng từ 1 đến 10, và 3 đề xuất cụ thể, có thể thực hiện để cải thiện.
Tập trung vào tính nhất quán, chiều sâu, sự gắn kết giữa các trường (ví dụ: mô tả so với Sổ tay Thế giới) và tiềm năng cho việc nhập vai hấp dẫn. Định dạng câu trả lời của bạn bằng markdown.

JSON Thẻ Nhân vật đầy đủ:
\`\`\`json
${cardJson}
\`\`\`
`;

  try {
    const response = await ai.models.generateContent({
        model: getActiveModel(),
        contents: prompt,
        config: {
            safetySettings,
        },
    });
    return response.text || '';
  } catch (error) {
    console.error("Gemini API error in analyzeCard:", error);
    throw new Error("Không thể nhận phân tích từ Gemini. Vui lòng kiểm tra API key và kết nối mạng.");
  }
}

export async function enhanceField(field: EnhancementField, currentValue: string, cardContext: CharacterCard): Promise<string> {
  const contextJson = JSON.stringify(cardContext, null, 2);
  const ai = getGeminiClient();
  
  const fieldName = field.replace('_', ' ');

  const prompt = `
Bạn là một trợ lý AI chuyên về viết sáng tạo cho các nhân vật nhập vai.
Dựa trên bối cảnh nhân vật đầy đủ được cung cấp (bao gồm mô tả, tính cách, kịch bản, Sổ tay Thế giới, v.v.), hãy viết lại trường sau đây để trở nên gợi cảm, hấp dẫn và nhất quán hơn với toàn bộ con người nhân vật.
CHỈ trả về văn bản mới cho trường đó, không có bất kỳ bình luận hay nhãn phụ nào.

Bối cảnh nhân vật đầy đủ:
\`\`\`json
${contextJson}
\`\`\`

Trường cần cải thiện: "${fieldName}"

Nội dung hiện tại:
"${currentValue}"

Nội dung mới, đã được cải thiện:
`;
  
  try {
    const response = await ai.models.generateContent({
        model: getActiveModel(),
        contents: prompt,
        config: {
            safetySettings,
        },
    });
    // Clean up potential markdown code blocks or quotes
    return response.text?.trim().replace(/^`+[\w]*\n|`+$/g, '').trim() || '';
  } catch (error) {
    console.error(`Gemini API error in enhanceField for ${field}:`, error);
    throw new Error(`Không thể cải thiện ${fieldName} bằng Gemini. Vui lòng kiểm tra API key và kết nối mạng.`);
  }
}


export async function summarizeHistory(historySlice: ChatMessage[], cardName: string, customPrompt?: string): Promise<string> {
  // FIX: Fallback to originalRawContent if content is empty (Interactive Card Support)
  // NEW: Use cleanMessageContent to strip thoughts/technical blocks
  const historyText = historySlice.map(msg => {
    const rawContent = msg.content || msg.originalRawContent || '';
    const cleanContent = cleanMessageContent(rawContent);
    
    if (!cleanContent.trim()) return null; // Skip empty lines after cleaning

    if (msg.role === 'user') return `User: ${cleanContent}`;
    return `${cardName}: ${cleanContent}`;
  }).filter(Boolean).join('\n');
  
  const ai = getGeminiClient();

  let prompt = "";
  
  if (customPrompt) {
      // Use user provided prompt, replacing the placeholder and {{char}}
      prompt = customPrompt
        .replace('{{chat_history_slice}}', historyText)
        .replace(/{{char}}/g, cardName);
  } else {
      // Fallback default prompt
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
    const response = await ai.models.generateContent({
        model: getActiveModel(),
        contents: prompt,
        config: {
            safetySettings,
        },
    });
    return response.text?.trim() || "";
  } catch (error) {
    console.error("Gemini API error in summarizeHistory:", error);
    return ""; // Return empty string on failure to not break the chat flow
  }
}

/**
 * Sends the constructed prompt to the selected API (Gemini or OpenRouter).
 */
export async function sendChatRequest(
    fullPrompt: string,
    settings: SillyTavernPreset
): Promise<{ response: GenerateContentResponse }> {
    
    // --- API Dispatch ---
    
    // 1. REVERSE PROXY (Kingfall Mode)
    if (settings.chat_completion_source === 'proxy') {
        const proxyUrl = getProxyUrl();
        const cleanUrl = proxyUrl.trim().replace(/\/$/, '');
        const endpoint = `${cleanUrl}/v1/chat/completions`; // Standard OpenAI format
        const model = settings.proxy_model || 'gemini-3-pro-preview'; // Default fallback to Gemini 3.0 Pro Preview

        try {
            // Construct OpenAI-compatible body
            const payload = {
                model: model,
                messages: [
                    // SillyTavern usually packs everything into a single prompt for completion models,
                    // or a series of messages for Chat models.
                    // Given our `fullPrompt` is already a constructed string, we treat it as a single User message.
                    { role: 'user', content: fullPrompt }
                ],
                temperature: Number(settings.temp) || 1,
                top_p: Number(settings.top_p) || 1,
                top_k: Number(settings.top_k) || 40,
                max_tokens: Number(settings.max_tokens) || 4096,
                stop: settings.stopping_strings && settings.stopping_strings.length > 0 ? settings.stopping_strings : undefined,
                stream: false
            };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    // MẸO QUAN TRỌNG: Sử dụng 'text/plain' thay vì 'application/json'
                    // Điều này ngăn trình duyệt gửi yêu cầu OPTIONS (Preflight) trước khi gửi POST.
                    // Các server proxy local (như Kingfall/Dark-Server) thường không xử lý tốt CORS OPTIONS và trả về 404, gây lỗi "Failed to fetch".
                    // Tuy nhiên, body vẫn là chuỗi JSON, và server thường vẫn parse được nó.
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // Thử đọc lỗi dưới dạng text
                const errorText = await response.text();
                // Nếu server trả về 404 cho POST, có nghĩa là endpoint sai
                if (response.status === 404) {
                     throw new Error(`Server không tìm thấy endpoint (${endpoint}). Vui lòng kiểm tra lại URL.`);
                }
                throw new Error(`Proxy Error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
            
            return { response: { text } as GenerateContentResponse };

        } catch (error) {
            console.error("Proxy API error:", error);
            // Cung cấp thông báo lỗi chi tiết hơn cho người dùng
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Lỗi kết nối Proxy: ${msg}`);
        }
    }

    // 2. OPEN ROUTER
    if (settings.chat_completion_source === 'openrouter' && settings.openrouter_model) {
        // --- OpenRouter Logic ---
        const openRouterKey = getOpenRouterApiKey();
        if (!openRouterKey) {
            throw new Error("API Key của OpenRouter chưa được đặt. Vui lòng đặt nó trong Cài đặt API.");
        }
        
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openRouterKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin, // Recommended by OpenRouter
                    'X-Title': 'SillyTavern Card Studio' // Recommended by OpenRouter
                },
                body: JSON.stringify({
                    model: settings.openrouter_model,
                    messages: [{ role: 'user', content: fullPrompt }], // Send the entire constructed prompt as a user message
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
            // Adapt the response to look like a Gemini response for compatibility
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
                model: getActiveModel(),
                contents: fullPrompt,
                config: config,
            });

            // --- NATIVE THINKING EXTRACTION ---
            // Nếu có suy nghĩ native, nó sẽ nằm trong 'parts' nhưng thường bị ẩn khỏi '.text' mặc định.
            // Ta cần lấy nó ra và bọc vào <thinking> để UI hiển thị.
            if (settings.thinking_budget && Number(settings.thinking_budget) > 0) {
                const parts = response.candidates?.[0]?.content?.parts || [];
                let thoughtContent = '';
                let finalContent = '';

                for (const part of parts) {
                    // Kiểm tra thuộc tính 'thought' (casting as any vì type SDK có thể chưa cập nhật kịp)
                    if ((part as any).thought) {
                        thoughtContent += part.text;
                    } else {
                        // Nội dung chính
                        finalContent += part.text;
                    }
                }

                // Nếu tìm thấy suy nghĩ native
                if (thoughtContent) {
                    // Ghép lại: Suy nghĩ (trong thẻ) + Nội dung chính
                    // Việc bọc trong <thinking> sẽ kích hoạt UI "Xem quy trình suy nghĩ" ở MessageBubble.tsx
                    const combinedText = `<thinking>${thoughtContent}</thinking>\n${finalContent}`;
                    
                    // Ghi đè getter .text của response object để trả về chuỗi đã ghép
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


export async function generateLorebookEntry(
  keyword: string,
  chatMessages: ChatMessage[],
  longTermSummaries: string[],
  existingLorebooks: Lorebook[]
): Promise<string> {
  const ai = getGeminiClient();

  // 1. Format Chat Context
  const longTermSummaryString = longTermSummaries.length > 0
    ? longTermSummaries.join('\n\n---\n\n')
    : "Không có tóm tắt dài hạn.";

  const recentHistoryString = chatMessages.map(msg => {
    const role = msg.role === 'user' ? 'User' : (chatMessages.find(c => c.role === 'model')?.originalRawContent?.split(':')[0] || 'Model');
    // FIX: Fallback here too
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
    const response = await ai.models.generateContent({
        model: getActiveModel(),
        contents: prompt,
        config: {
            safetySettings,
        },
    });
    return response.text?.trim() || '';
  } catch (error) {
    console.error("Gemini API error in generateLorebookEntry:", error);
    throw new Error("Không thể tạo mục sổ tay từ Gemini. Vui lòng kiểm tra API key và kết nối mạng.");
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

        // Sắp xếp các mô hình theo thứ tự bảng chữ cái theo tên để có UX tốt hơn
        data.data.sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name));

        return data.data;

    } catch (error) {
        if (error instanceof Error) {
            // Ném lại với một thông báo thân thiện hơn nếu đó là lỗi mạng
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
    // 1. Try direct parse (Best case)
    try {
        return JSON.parse(text);
    } catch (e) {
        // Continue
    }

    // 2. Remove markdown fences
    try {
        const cleanMarkdown = text.replace(/```(?:json)?|```/g, '').trim();
        return JSON.parse(cleanMarkdown);
    } catch (e) {
        // Continue
    }

    // 3. Robust Substring Extraction (Search for outermost {})
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

    throw new Error("Could not parse JSON from response.");
}

export async function scanWorldInfoWithAI(
    combinedContext: string, // Not used in new logic, kept for signature compat temporarily if needed
    contextList: string, // Constants / Background info
    candidateList: string, // The items AI should choose from
    latestInput: string, // NEW: User's latest input
    stateString: string, // NEW: Formatted Variable State
    modelName: string = 'gemini-2.5-flash',
    customSystemPrompt?: string // NEW: Customizable System Prompt
): Promise<{selectedIds: string[], outgoingPrompt: string, rawResponse: string}> {
    
    const ai = getGeminiClient();
    
    // Use Custom Prompt or Fallback to Default
    const baseSystemPrompt = customSystemPrompt || defaultPreset.smart_scan_system_prompt || '';
    
    // Replace macros safely (using global replace regex)
    const finalPrompt = baseSystemPrompt
        .replace(/{{context}}/g, contextList || '(Không có)')
        .replace(/{{state}}/g, stateString || '(Không có)')
        .replace(/{{history}}/g, combinedContext || '(Không có)') // combinedContext is passed as history
        .replace(/{{input}}/g, latestInput || '(Không có)')
        .replace(/{{candidates}}/g, candidateList || '(Không có)');

    try {
        const response = await ai.models.generateContent({
            model: modelName, // Use scanning specific model
            contents: finalPrompt,
            config: {
                temperature: 0, // Deterministic for logic
                responseMimeType: 'application/json',
                safetySettings,
            },
        });

        const text = response.text?.trim() || '{}';
        let selectedIds: string[] = [];
        
        try {
            // Use the robust parser to handle messy LLM output
            const parsed = extractAndParseJson(text);
            
            // Handle both array format (legacy) and object format (new)
            if (Array.isArray(parsed)) {
                selectedIds = parsed;
            } else if (parsed.selected_ids && Array.isArray(parsed.selected_ids)) {
                selectedIds = parsed.selected_ids;
            }
        } catch (e) {
            console.error("Failed to parse JSON from Smart Scan:", text);
            // Fallback to empty list on error to prevent crash
        }
        
        return { 
            selectedIds, 
            outgoingPrompt: finalPrompt, 
            rawResponse: text 
        };

    } catch (error) {
        console.error("Gemini API error in scanWorldInfoWithAI:", error);
        return { selectedIds: [], outgoingPrompt: finalPrompt, rawResponse: String(error) };
    }
}
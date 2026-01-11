
import type { SillyTavernPreset } from '../../types';
import { getProxyUrl, getProxyPassword, getProxyLegacyMode } from '../settingsService';

export const callProxy = async (
    model: string,
    prompt: string,
    settings: SillyTavernPreset
): Promise<string> => {
    const proxyUrl = getProxyUrl();
    const proxyPassword = getProxyPassword();
    const isLegacyMode = getProxyLegacyMode();
    const cleanUrl = proxyUrl.trim().replace(/\/$/, '');

    const payload = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: Number(settings.temp) || 1,
        max_tokens: Number(settings.max_tokens) || 4096,
        stream: false
    };

    const headers: Record<string, string> = {};
    if (isLegacyMode) {
        headers['Content-Type'] = 'text/plain';
    } else {
        headers['Content-Type'] = 'application/json';
        if (proxyPassword) headers['Authorization'] = `Bearer ${proxyPassword}`;
    }

    const response = await fetch(`${cleanUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
};

// Fix: Added callOpenAIProxyTask for non-chat completions (e.g. translation, scanning)
// Update: Added maxTokens parameter to prevent truncation
export const callOpenAIProxyTask = async (
    prompt: string,
    model: string,
    protocol: string,
    safetySettings: any[],
    maxTokens: number = 16384 // Default safe value increased
): Promise<string> => {
    const proxyUrl = getProxyUrl();
    const proxyPassword = getProxyPassword();
    const isLegacyMode = getProxyLegacyMode();
    const cleanUrl = proxyUrl.trim().replace(/\/$/, '');

    const payload = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: maxTokens, // Use the dynamic value
        stream: false
    };

    const headers: Record<string, string> = {};
    if (isLegacyMode) {
        headers['Content-Type'] = 'text/plain';
    } else {
        headers['Content-Type'] = 'application/json';
        if (proxyPassword) headers['Authorization'] = `Bearer ${proxyPassword}`;
    }

    const response = await fetch(`${cleanUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Proxy Task Error: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
};

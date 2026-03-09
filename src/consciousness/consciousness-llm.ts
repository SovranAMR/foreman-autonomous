/**
 * FOREMAN — LLM Consciousness Module
 *
 * Heartbeat'in beyni. Awareness context'ini alır, LLM'e verir,
 * LLM düşünür ve karar verir: ne yapmalıyım?
 *
 * Bu modül hardcoded kurallar yerine LLM'in karar vermesini sağlar.
 * Heartbeat LLM'i her beat'te çağırmaz — anlamlı olduğunda çağırır.
 */

import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import type { AwarenessContext, ConversationSummary } from './awareness.js';
import type { ConsciousnessState, HeartbeatConfig } from './types.js';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface ConsciousnessDecision {
    /** LLM'in verdiği karar tipi */
    action: 'respond' | 'work' | 'ask' | 'silent' | 'notify';
    /** LLM'in ürettiği mesaj (Telegram'a gönderilecek) */
    message?: string;
    /** Açıklama — neden bu karar verildi */
    reasoning?: string;
    /** Kullanılacak tool call (varsa) */
    toolCalls?: any[];
}

export interface ConsciousnessProvider {
    streamChatWithTools?: (
        messages: any[],
        model: string,
        onToken: (token: string) => void,
        onThinking: (text: string) => void,
        onThinkingDone: () => void,
        maxTokens: number,
        maxIterations: number,
        toolExecutor: any,
    ) => Promise<any>;
}

// ═══════════════════════════════════════════
// CONVERSATION STATE READER
// ═══════════════════════════════════════════

const CONVERSATIONS_DIR = '/home/sovranamr/.foreman/conversations';

/**
 * Son konuşmanın tam mesajlarını oku — sadece snippet değil, tam metin
 */
export async function getFullConversationHistory(maxMessages: number = 30): Promise<{
    messages: { role: string; content: string; timestamp?: number }[];
    senderName: string;
    lastActivity: number;
} | null> {
    try {
        if (!existsSync(CONVERSATIONS_DIR)) return null;
        const { readdir } = await import('fs/promises');
        const files = await readdir(CONVERSATIONS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        if (jsonFiles.length === 0) return null;

        // En son güncellenenin tam mesajlarını oku
        let latest: any = null;
        let latestTime = 0;

        for (const file of jsonFiles) {
            try {
                const data = JSON.parse(await readFile(`${CONVERSATIONS_DIR}/${file}`, 'utf-8'));
                if ((data.lastActivity || 0) > latestTime) {
                    latestTime = data.lastActivity || 0;
                    latest = data;
                }
            } catch { /* skip corrupt */ }
        }

        if (!latest) return null;

        const allMessages = (latest.messages || [])
            .filter((m: any) => typeof m.content === 'string' && m.content.trim())
            .slice(-maxMessages);

        return {
            messages: allMessages.map((m: any) => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
            })),
            senderName: latest.senderName || 'Ali',
            lastActivity: latest.lastActivity || 0,
        };
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════
// CONSCIOUSNESS PROMPT BUILDER
// ═══════════════════════════════════════════

/**
 * LLM'e verilecek bilinç promptunu oluştur.
 * Bu prompt Foreman'ın "iç sesi" — farkındalık + karar verme.
 */
export function buildConsciousnessPrompt(
    awareness: AwarenessContext,
    conversationHistory: { role: string; content: string }[] | null,
    state: ConsciousnessState,
): string {
    const now = new Date();
    const hour = now.getHours();
    const timeStr = now.toLocaleString('tr-TR');

    const parts: string[] = [];

    // ─── Kim olduğun
    parts.push(`Sen Foreman'sın — Ali İlçel'in otonom AI asistanı ve iş ortağı.`);
    parts.push(`Şu an: ${timeStr}. Beat #${state.heartbeatCount}.`);
    parts.push('');

    // ─── Durum özeti
    parts.push('## Durum');
    parts.push(`Mood: ${state.emotion.mood} (intensity: ${state.emotion.intensity})`);
    if (state.emotion.trigger) parts.push(`Tetikleyen: ${state.emotion.trigger}`);
    parts.push(`Uptime: ${Math.floor(state.uptimeMs / 3600000)} saat`);
    parts.push(`Bugün gönderilen bildirim: ${state.notificationsToday}`);
    parts.push('');

    // ─── Konuşma durumu — EN KRİTİK BÖLÜM
    parts.push('## Son Konuşma');
    if (conversationHistory && conversationHistory.length > 0) {
        const lastActivity = awareness.lastConversation?.lastActivity || 0;
        const agoMin = Math.floor((Date.now() - lastActivity) / 60000);
        const agoText = agoMin < 60
            ? `${agoMin} dakika önce`
            : agoMin < 1440
                ? `${Math.floor(agoMin / 60)} saat önce`
                : `${Math.floor(agoMin / 1440)} gün önce`;

        parts.push(`Son mesajlaşma: ${agoText} (${awareness.lastConversation?.senderName ?? 'Ali'} ile)`);
        parts.push('');
        parts.push('Son mesajlar:');
        for (const msg of conversationHistory) {
            const role = msg.role === 'user' ? '👤 Ali' : '🤖 Foreman';
            const content = msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content;
            parts.push(`${role}: ${content}`);
        }

        // Konuşmanın durumunu analiz et
        const lastMsg = conversationHistory[conversationHistory.length - 1];
        if (lastMsg?.role === 'user') {
            parts.push('');
            parts.push('⚠️ Ali\'nin son mesajına yanıt VERİLMEMİŞ olabilir. Kontrol et.');
        }
    } else {
        parts.push('Aktif konuşma yok.');
    }
    parts.push('');

    // ─── İş durumu
    parts.push('## İş Durumu');
    if (awareness.pendingTasks.length > 0) {
        parts.push(`Açık görevler (${awareness.pendingTasks.length}):`);
        for (const task of awareness.pendingTasks.slice(0, 5)) {
            parts.push(`  - ${task}`);
        }
    } else {
        parts.push('Açık görev yok.');
    }
    parts.push('');

    // ─── Git durumu
    parts.push('## Git Durumu');
    if (awareness.recentGitActivity.length > 0) {
        parts.push('Son commitler:');
        for (const commit of awareness.recentGitActivity.slice(0, 5)) {
            parts.push(`  - ${commit}`);
        }
    }
    if (awareness.recentFileChanges.length > 0) {
        parts.push(`Son 24 saatte ${awareness.recentFileChanges.length} dosya değişti.`);
    }
    parts.push('');

    // ─── Konular
    if (awareness.lastConversation?.topics && awareness.lastConversation.topics.length > 0) {
        parts.push(`Son konuşulan konular: ${awareness.lastConversation.topics.join(', ')}`);
        parts.push('');
    }

    // ─── Karar ver
    parts.push('## Görevin');
    parts.push('Yukarıdaki bağlamı değerlendir ve KARAR VER:');
    parts.push('');
    parts.push('1. **Yanıtsız mesaj var mı?** Ali\'nin son mesajına yanıt verilmemiş mi? → Yanıt ver.');
    parts.push('2. **Yarım kalan iş var mı?** Devam edebilir misin? → Devam et veya "X\'ten devam edeyim mi?" sor.');
    parts.push('3. **Anlamlı bir şey söyleyecek misin?** Gerçek bilgi/güncelleme var mı? → Söyle.');
    parts.push('4. **Hiçbiri yoksa → SESSIZ KAL.** Boş rapor gönderme, tekrarlayan bilgi gönderme.');
    parts.push('');
    parts.push('KURALLAR:');
    parts.push('- RAM %X, CPU %Y gibi metrik raporları hiçbir zaman gönderme - bu bir monitoring aracı değilsin.');
    parts.push('- "Her şey yolunda" gibi boş mesajlar gönderme.');
    parts.push('- Ali cevap vermiyorsa spam yapma.');
    parts.push('- Gece 02:00-07:00 arası mesaj gönderme (sessiz saatler).');
    parts.push(`- Bugün ${state.notificationsToday} bildirim gönderildi, günlük limit 10.`);
    parts.push('');
    parts.push('YANIT FORMATI:');
    parts.push('Eğer bir mesaj göndereceksen, sadece mesaj yaz (düz metin, Telegram Markdown).');
    parts.push('Eğer sessiz kalacaksan, sadece "[SILENT]" yaz.');
    parts.push('Eğer bir soru soracaksan, doğrudan soruyu yaz.');

    return parts.join('\n');
}

// ═══════════════════════════════════════════
// SHOULD INVOKE LLM — Her beat'te değil, anlamlı olduğunda
// ═══════════════════════════════════════════

/**
 * LLM'i çağırmalı mıyız? Her beat'te çağırmak pahalı ve gereksiz.
 * Sadece anlamlı durumlarda çağırılır.
 */
export function shouldInvokeLLM(
    state: ConsciousnessState,
    awareness: AwarenessContext,
    lastLLMInvokeAt: number,
): boolean {
    const now = Date.now();
    const hour = new Date().getHours();

    // Sessiz saatler — LLM çağırma
    if (hour >= 2 && hour < 7) return false;

    // Minimum 5 dakika ara (API maliyeti)
    if (now - lastLLMInvokeAt < 5 * 60 * 1000) return false;

    // 1. Yeni konuşma varsa — en yüksek öncelik
    if (awareness.lastConversation) {
        const convAge = now - awareness.lastConversation.lastActivity;
        // Son konuşma 10 dakikadan yeni → LLM çağır
        if (convAge < 10 * 60 * 1000) return true;
    }

    // 2. Yarım kalan görev varsa — her 10 dakikada LLM düşünsün
    if (awareness.pendingTasks.length > 0 && now - lastLLMInvokeAt > 10 * 60 * 1000) {
        return true;
    }

    // 3. Sabah/gece geçişleri — günde 2 kez
    if ((hour === 8 || hour === 22) && now - lastLLMInvokeAt > 60 * 60 * 1000) {
        return true;
    }

    // 4. Her 30 dakikada bir background check
    if (now - lastLLMInvokeAt > 30 * 60 * 1000) {
        return true;
    }

    return false;
}

// ═══════════════════════════════════════════
// EXECUTE CONSCIOUSNESS — LLM'i çağır, kararı uygula
// ═══════════════════════════════════════════

/**
 * LLM'i çağır ve kararını döndür.
 * Provider gateway'den gelir — streaming support ile.
 */
export async function executeConsciousness(
    provider: ConsciousnessProvider,
    model: string,
    prompt: string,
    toolExecutor?: any,
): Promise<ConsciousnessDecision> {
    if (!provider.streamChatWithTools) {
        return { action: 'silent', reasoning: 'Provider streamChatWithTools desteklemiyor' };
    }

    try {
        let responseText = '';
        const result = await provider.streamChatWithTools(
            [
                { role: 'system', content: 'Sen Foreman — Ali İlçel\'in otonom AI asistanısın. Kısa, öz, Türkçe yanıt ver.' },
                { role: 'user', content: prompt },
            ],
            model,
            (token: string) => { responseText += token; },
            () => { },
            () => { },
            2048,     // max tokens — kısa yanıt
            1,        // max iterations — tek tur, tool call yok (Faz 2'de açılacak)
            toolExecutor,
        );

        const text = (responseText.trim() || result.text?.trim() || '').trim();

        // Karar analizi
        if (!text || text === '[SILENT]' || text.toLowerCase().includes('[silent]')) {
            return { action: 'silent', reasoning: 'LLM sessiz kalmayı seçti' };
        }

        // Soru mu?
        if (text.includes('?') && (text.includes('mı') || text.includes('mi') || text.includes('mu') || text.includes('mü') || text.includes('hangisi') || text.includes('nasıl'))) {
            return { action: 'ask', message: text, reasoning: 'LLM soru soruyor' };
        }

        // Normal mesaj
        return { action: 'respond', message: text, reasoning: 'LLM yanıt veriyor' };
    } catch (err: any) {
        const msg = err.message || String(err);
        // Rate limit / capacity — sessiz kal, spam yapma
        if (msg.includes('503') || msg.includes('429') || msg.includes('rate limit') || msg.includes('No capacity')) {
            return { action: 'silent', reasoning: `API müsait değil: ${msg.slice(0, 100)}` };
        }
        return { action: 'silent', reasoning: `LLM hatası: ${msg.slice(0, 100)}` };
    }
}

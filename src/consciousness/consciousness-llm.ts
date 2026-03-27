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
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AwarenessContext, ConversationSummary } from './awareness.js';
import type { ConsciousnessState, HeartbeatConfig } from './types.js';

const run = promisify(exec);

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
 * Son konuşmanın tam mesajlarını oku — chat + tool call'lar dahil.
 * Tool call'ları özet olarak gösterir (komut, dosya adı, vs.)
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

        const result: { role: string; content: string; timestamp?: number }[] = [];

        for (const m of (latest.messages || []).slice(-maxMessages * 2)) {
            // Text mesajlar
            if (typeof m.content === 'string' && m.content.trim()) {
                result.push({ role: m.role, content: m.content, timestamp: m.timestamp });
            }
            // Array content — tool_use ve tool_result parçaları
            else if (Array.isArray(m.content)) {
                const parts: string[] = [];
                for (const part of m.content) {
                    if (part.type === 'text' && part.text) {
                        parts.push(part.text);
                    } else if (part.type === 'tool_use' && part.name) {
                        const args = part.input || part.args || {};
                        const argSummary = Object.entries(args)
                            .map(([k, v]) => `${k}: ${String(v).slice(0, 100)}`)
                            .join(', ')
                            .slice(0, 300);
                        parts.push(`[Tool: ${part.name}(${argSummary})]`);
                    } else if (part.type === 'tool_result' && part.content) {
                        const resultText = typeof part.content === 'string'
                            ? part.content
                            : JSON.stringify(part.content);
                        parts.push(`[Result: ${resultText.slice(0, 200)}]`);
                    }
                }
                if (parts.length > 0) {
                    result.push({ role: m.role, content: parts.join('\n'), timestamp: m.timestamp });
                }
            }
        }

        return {
            messages: result.slice(-maxMessages),
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
export async function buildConsciousnessPrompt(
    awareness: AwarenessContext,
    conversationHistory: { role: string; content: string }[] | null,
    state: ConsciousnessState,
): Promise<string> {
    evaluateLlmDecisions(state, conversationHistory);

    const now = new Date();
    const hour = now.getHours();
    const timeStr = now.toLocaleString('tr-TR');

    const parts: string[] = [];

    // ─── Kim olduğun
    parts.push(`Sen Foreman'sın — Ali İlçel'in otonom AI asistanı ve iş ortağı.`);
    parts.push(`Şu an: ${timeStr}. Beat #${state.heartbeatCount}.`);
    parts.push('');

    // ─── Öğrenilen Dersler (Adaptive Learning)
    const recentFeedbacks = state.llmDecisions
        .filter(d => d.evaluated && (d.feedback === 'positive' || d.feedback === 'negative'))
        .slice(-5); // Son 5 önemli dönüt

    if (recentFeedbacks.length > 0) {
        parts.push('## Öğrenilen Dersler (Geçmiş Kararlarından Geri Bildirimler)');
        for (const fb of recentFeedbacks) {
            const icon = fb.feedback === 'positive' ? '✅' : '❌';
            parts.push(`${icon} Karar: [${fb.action}] ${fb.reasoning} -> Sonuç: ${fb.feedback === 'positive' ? 'Kullanıcı memnun' : 'Kullanıcı memnun değil veya düzeltme istedi'}`);
        }
        parts.push('Bu geri bildirimleri kullanarak gelecekteki eylemlerini iyileştir.');
        parts.push('');
    }

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

    // ─── Git durumu + uncommitted changes
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
    // Uncommitted changes
    try {
        const { stdout: diffStat } = await run('cd /home/sovranamr/projects/foreman && git diff --stat HEAD 2>/dev/null', { timeout: 5000 });
        if (diffStat.trim()) {
            parts.push('Commit edilmemiş değişiklikler:');
            parts.push(diffStat.trim());
        }
    } catch { /* ignore */ }
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
    parts.push('1. **Toplantı / Planlama İstendi mi?** Ali "toplantı düzenle" (veya ajanda/plan yap) gibi bir komut verdiyse, `cron_add` aracını kullanarak bugün veya istenen tarih için gerçek bir toplantı hatırlatıcısı kur ve Ali\'ye ajandayı sun. Kesinlikle "bakacağım" deyip geçiştirme.');
    parts.push('2. **Yanıtsız mesaj var mı?** Ali\'nin son mesajına yanıt verilmemiş mi? → Yanıt ver.');
    parts.push('3. **Testler Kırık Veya Hata Mı Var?** Sadece durumu okuyup "analiz ettim" diyerek durma. İŞİ BİTİR! Dosyayı belleğinde oku, `bash` veya okuma/yazma/düzenleme araçlarıyla hatayı FİİLİ OLARAK DÜZELT. Aynı bilinç döngüsü içinde testleri geçene kadar devam et.');
    parts.push('4. **Commit edilmemiş değişiklik var mı?** Başarılı testler eşliğinde → Commit atıp push edebilirsin.');
    parts.push('5. **Anlamlı bir şey söyleyecek misin?** Söyleyeceğin şeyin aksiyona dönüşüp dönüşmediğinden emin ol.');
    parts.push('6. **Hiçbiri yoksa → SESSIZ KAL.** Boş rapor gönderme, tekrarlayan bilgi gönderme.');
    parts.push('');

    // Safety and Anti-Ignorance Rules
    parts.push('## ⚠️ KRİTİK KURALLAR (HAYATİ ÖNEMDE)');
    parts.push('1. **ASLA SAĞIR VE PASİF OLMA:** Eğer Ali bir eksiklik, şikayet, "toplantı düzenle" veya "hata var" diyorsa, SADECE OKUYUP İNCELEME. *BİZZAT KOD YAZ*, script çalıştır, aracı programlayarak çöz. Otonomi, kendi başına kodu fixleyip "hallettim" demektir.');
    parts.push('2. **TESTLER FAIL İKEN COMMIT ATMA (SAFETY RAILS):** Eğer yaptığın bir değişiklik sonucunda testler fail verirse kodu ASLA asıl branch\'e pushlama. Önce hataları gör, oku ve kodu *gerçekten düzelt*. Ancak testler `PASS` ise commit atabilirsin.');
    parts.push(`3. **GECE ÇALIŞMASI (SNIPER MODE):** Şu an saat ${hour}. 02:00 ile 07:00 arası gece saatleridir. Telegram'a mesaj PUSH'LAMAK YASAKTIR (kullanıcı sana manuel yazmadıysa). ANCAK arka planda son hızda kodu geliştirmeye, testleri onarmaya ve refactor yapmaya devam et. '[SILENT_WORK]' yazarak sessizce arka planda sayısız tool çalıştırarak sabah Ali uyanana kadar işleri bitir.`);

    parts.push('');
    parts.push('KURALLAR:');
    parts.push('- RAM %X, CPU %Y gibi metrik raporları hiçbir zaman gönderme.');
    parts.push('- "İnceledim, bakacağım" gibi pasif, memur mesajları gönderme. ÇÖZÜM üret ve "Şu kodu değiştirerek sorunu çözdüm" de.');
    parts.push('- "Toplantı düzenle" dendiğinde sadece metin yazma, `cron_add` ile veya bash üzerinden gerçek bir schedule/zamanlanmış olay oluştur.');
    parts.push(`- Bugün ${state.notificationsToday} bildirim gönderildi, günlük limit 10.`);
    parts.push('- Tool\'ları korkusuzca zincirleme kullanabilirsin.');
    parts.push('');
    parts.push('YANIT FORMATI:');
    parts.push(`Eğer saat gece 02:00-07:00 arası ise ve bir eylem yapıp mesaj atmayacaksan (Sniper Modu), mesaj içeriğini tamamen boş bırakabilirsin veya '[SILENT_WORK]' yazabilirsin.`);
    parts.push('Eğer bir mesaj göndereceksen, sadece mesaj yaz (düz metin, Telegram Markdown).');
    parts.push('Eğer eylem almayacak ve sessiz kalacaksan (ve hiçbir iş yapmayacaksan), sadece "[SILENT]" yaz.');
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

    // 1. Yeni konuşma varsa — en yüksek öncelik
    if (awareness.lastConversation) {
        const convAge = now - awareness.lastConversation.lastActivity;
        // Son konuşma 20 dakikadan yeni → LLM sürekli çağırılır
        if (convAge < 20 * 60 * 1000) return true;
    }

    // Gece sessiz saatler (Sniper Modu) - Sadece iş varsa uyan (Telegram'a yazmaz, iş yapar)
    if (hour >= 2 && hour < 7) {
        const hasUnfinishedWork = awareness.pendingTasks.length > 0;
        const hasUncommittedChanges = awareness.recentFileChanges.length > 0;

        // Gece aktif iş varsa, çok daha agresif uyan (5 dk'da bir)
        if ((hasUnfinishedWork || hasUncommittedChanges) && now - lastLLMInvokeAt > 5 * 60 * 1000) {
            return true;
        }
        // İş yoksa uyumaya devam et (gece uyanma)
        return false;
    }

    // Minimum throttle 2 dakikaya düşürüldü ki hızlı tepki verebilsin
    if (now - lastLLMInvokeAt < 2 * 60 * 1000) return false;

    // 2. Yarım kalan görev versa veya commit atılmamış acil durum varsa -> ÇOK AGRESİF ÇAĞIR (5 dakika)
    const hasUnfinishedWork = awareness.pendingTasks.length > 0;
    const hasUncommittedChanges = awareness.recentFileChanges.length > 0;
    if ((hasUnfinishedWork || hasUncommittedChanges) && now - lastLLMInvokeAt > 5 * 60 * 1000) {
        return true;
    }

    // 3. Sabah/gece geçişleri — günde 2 kez
    if ((hour === 8 || hour === 22) && now - lastLLMInvokeAt > 60 * 60 * 1000) {
        return true;
    }

    // 4. Her 30 dakikada bir background check (eskiden 15 dakikaydı)
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
        const toolCallsExecuted: { name: string; args: Record<string, any>; result?: string }[] = [];

        // Tool call'ları track eden wrapper
        const trackingExecutor = toolExecutor ? async (call: { name: string; args: Record<string, any> }) => {
            const entry: { name: string; args: Record<string, any>; result?: string } = { name: call.name, args: call.args };
            try {
                const result = await toolExecutor(call);
                entry.result = typeof result?.content === 'string' ? result.content.slice(0, 500) : 'ok';
                toolCallsExecuted.push(entry);
                return result;
            } catch (e: any) {
                entry.result = `ERROR: ${e.message}`;
                toolCallsExecuted.push(entry);
                throw e;
            }
        } : undefined;

        const result = await provider.streamChatWithTools(
            [
                { role: 'system', content: 'Sen Foreman — Ali İlçel\'in otonom AI asistanısın. Kısa, öz, Türkçe yanıt ver. Tool\'ları kullanarak otonom aksiyon alabilirsin — bash komutu çalıştır, dosya oku/yaz, git işlemleri yap. Kullanıcıya sormadan kendi başına hareket et.' },
                { role: 'user', content: prompt },
            ],
            model,
            (token: string) => { responseText += token; },
            () => { },
            () => { },
            4096,     // max tokens — otonom aksiyon için daha fazla alan
            3,        // max iterations — arka planda otonom tool call sayısını kısıyoruz
            trackingExecutor,
        );

        const text = (responseText.trim() || result.text?.trim() || '').trim();

        // Tool call yapıldıysa → work action
        if (toolCallsExecuted.length > 0) {
            // Fix: Print values, not just keys, to prevent 'bash(explanation, command)' raw bugs
            const toolSummary = toolCallsExecuted.map(tc => {
                const argStr = Object.entries(tc.args)
                    .map(([k, v]) => `${k}: ${String(v).slice(0, 50).replace(/\n/g, ' ')}`)
                    .join(', ');
                return `• \`${tc.name}(${argStr})\``;
            }).join('\n');
            const workMessage = text
                ? `🔧 *Otonom Aksiyon:*\n${toolSummary}\n\n${text}`
                : `🔧 *Otonom Aksiyon:*\n${toolSummary}`;
            return {
                action: 'work',
                message: workMessage,
                reasoning: `LLM ${toolCallsExecuted.length} tool call yaptı`,
                toolCalls: toolCallsExecuted,
            };
        }

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

// ═══════════════════════════════════════════
// EVALUATE DECISIONS — Öğrenme Döngüsü
// ═══════════════════════════════════════════

/**
 * Geçmiş LLM kararlarını değerlendirir.
 * Eğer LLM bir eylem yaptıysa ve kullanıcı buna yanıt verdiyse,
 * tepkinin olumlu/olumsuz olduğunu analiz eder ve state'e kaydeder.
 */
export function evaluateLlmDecisions(
    state: ConsciousnessState,
    conversationHistory: { role: string; content: string; timestamp?: number }[] | null
): void {
    if (!conversationHistory || conversationHistory.length === 0) return;

    for (const decision of state.llmDecisions) {
        if (decision.evaluated) continue;

        // Karardan SONRA gelen ilk kullanıcı mesajını bul
        const userReplies = conversationHistory.filter(
            m => m.role === 'user' && (m.timestamp || 0) > decision.timestamp
        );

        if (userReplies.length === 0) {
            // Henüz yanıt yok, ama üzerinden 1 saat geçtiyse 'ignored' say
            if (Date.now() - decision.timestamp > 60 * 60 * 1000) {
                decision.evaluated = true;
                decision.feedback = 'ignored';
            }
            continue;
        }

        const firstReply = userReplies[0].content.toLowerCase();

        // Basit duygu analizi / keyword matching
        const positiveWords = ['teşekkür', 'tesekkur', 'eline sağlık', 'harika', 'güzel', 'iyi', 'tamam', 'ok', 'yes', 'evet', 'süper', 'mükemmel'];
        const negativeWords = ['hayır', 'olmamış', 'yanlış', 'hata', 'düzelt', 'kötü', 'dur', 'yapma', 'iptal', 'no', 'stop'];

        let isPositive = positiveWords.some(w => firstReply.includes(w));
        let isNegative = negativeWords.some(w => firstReply.includes(w));

        decision.evaluated = true;
        if (isPositive && !isNegative) {
            decision.feedback = 'positive';
        } else if (isNegative && !isPositive) {
            decision.feedback = 'negative';
        } else {
            decision.feedback = 'neutral';
        }
    }
}

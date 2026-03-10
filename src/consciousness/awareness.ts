/**
 * FOREMAN — Awareness Module
 * 
 * Foreman'ın gözü, kulağı, hafızası.
 * Konuşma geçmişini, chain'leri, session'ları, son yapılanları okur.
 * Heartbeat'e besler — böylece Foreman neyin ne olduğunu bilir.
 * 
 * Şuursuz, bilinçsiz, gözsüz kulaksız olmasın diye var.
 */

import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface ConversationSummary {
  chatId: string;
  senderName: string;
  totalMessages: number;
  lastActivity: number;
  /** Son 10 mesajın özeti */
  recentMessages: { role: string; snippet: string; timestamp?: number }[];
  /** Son konuşulan konular */
  topics: string[];
}

export interface ChainSummary {
  id: string;
  name: string;
  status: string;
  layer: string;
  goal: string;
  createdAt: string;
  thoughtCount: number;
}

export interface AwarenessContext {
  /** Son konuşma — ne konuştuk */
  lastConversation: ConversationSummary | null;
  /** Aktif chain'ler — ne üzerinde çalışılıyor */
  activeChains: ChainSummary[];
  /** Tamamlanmış chain'ler — ne yapıldı */
  completedChains: ChainSummary[];
  /** Git durumu — projede ne değişti */
  recentGitActivity: string[];
  /** Son yapılan dosya değişiklikleri */
  recentFileChanges: string[];
  /** Yapılacaklar — açık görevler */
  pendingTasks: string[];
  /** Kullanıcı hakkında bilinen şeyler */
  userContext: Record<string, string>;
  /** Doğal dil özeti — heartbeat'in kullanacağı */
  summary: string;
  /** Son güncelleme */
  updatedAt: number;
}

// ═══════════════════════════════════════════
// PATHS
// ═══════════════════════════════════════════

const FOREMAN_DIR = '/home/sovranamr/.foreman';
const CONVERSATIONS_DIR = `${FOREMAN_DIR}/conversations`;
const CHAINS_DIR = '/home/sovranamr/projects/foreman/chains';
const PROJECT_DIR = '/home/sovranamr/projects/foreman';

// ═══════════════════════════════════════════
// CONVERSATION READER
// ═══════════════════════════════════════════

async function readConversations(): Promise<ConversationSummary[]> {
  const summaries: ConversationSummary[] = [];

  try {
    if (!existsSync(CONVERSATIONS_DIR)) return summaries;
    const files = await readdir(CONVERSATIONS_DIR);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(
          await readFile(`${CONVERSATIONS_DIR}/${file}`, 'utf-8')
        );
        const messages = data.messages || [];
        const recent = messages.slice(-10);

        // Konulardan topic çıkar
        const topics = extractTopics(recent);

        summaries.push({
          chatId: data.chatId || file.replace('.json', ''),
          senderName: data.senderName || 'Bilinmeyen',
          totalMessages: messages.length,
          lastActivity: data.lastActivity || 0,
          recentMessages: recent.map((m: any) => ({
            role: m.role,
            snippet: truncate(m.content, 150),
            timestamp: m.timestamp,
          })),
          topics,
        });
      } catch {
        // Bozuk dosya — atla
      }
    }
  } catch {
    // Dir yok — sorun değil
  }

  return summaries;
}

function extractTopics(messages: any[]): string[] {
  const topics: string[] = [];
  const userMsgs = messages.filter((m: any) => m.role === 'user');

  for (const msg of userMsgs) {
    const content = (msg.content || '').toLowerCase();

    // Anahtar kelimelerden konu çıkar
    if (content.includes('consciousness') || content.includes('bilinç')) topics.push('bilinç sistemi');
    if (content.includes('heartbeat') || content.includes('kalp')) topics.push('heartbeat');
    if (content.includes('telegram')) topics.push('telegram');
    if (content.includes('daemon') || content.includes('servis')) topics.push('daemon/servis');
    if (content.includes('test')) topics.push('test');
    if (content.includes('deploy') || content.includes('yayınla')) topics.push('deploy');
    if (content.includes('bug') || content.includes('hata') || content.includes('düzelt')) topics.push('bug fix');
    if (content.includes('yap') || content.includes('ekle') || content.includes('oluştur')) topics.push('yeni özellik');
    if (content.includes('eksik') || content.includes('nerede')) topics.push('durum kontrolü');
    if (content.includes('devam') || content.includes('tamam')) topics.push('devam');
    if (content.includes('hafıza') || content.includes('memory') || content.includes('awareness')) topics.push('hafıza/awareness');
    if (content.includes('otonom') || content.includes('kendi başına')) topics.push('otonom çalışma');
    if (content.includes('görev') || content.includes('task')) topics.push('görev yönetimi');
    if (content.includes('mesaj') || content.includes('proaktif')) topics.push('proaktif mesajlaşma');
  }

  // Dedupe
  return [...new Set(topics)];
}

// ═══════════════════════════════════════════
// CHAIN READER
// ═══════════════════════════════════════════

async function readChains(): Promise<ChainSummary[]> {
  const chains: ChainSummary[] = [];

  try {
    if (!existsSync(CHAINS_DIR)) return chains;
    const files = await readdir(CHAINS_DIR);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(
          await readFile(`${CHAINS_DIR}/${file}`, 'utf-8')
        );
        chains.push({
          id: data.id || file.replace('.json', ''),
          name: data.name || '',
          status: data.status || 'unknown',
          layer: data.layer || '',
          goal: truncate(data.goal || '', 200),
          createdAt: data.createdAt || '',
          thoughtCount: (data.thoughts || []).length,
        });
      } catch {
        // Bozuk dosya — atla
      }
    }
  } catch {
    // Dir yok
  }

  // Tarihe göre sırala, en yeni ilk
  chains.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return chains;
}

// ═══════════════════════════════════════════
// GIT ACTIVITY
// ═══════════════════════════════════════════

async function readRecentGitActivity(): Promise<string[]> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const run = promisify(exec);

    const { stdout } = await run(
      'cd /home/sovranamr/projects/foreman && git log --oneline -10 --no-decorate 2>/dev/null',
      { timeout: 5000 }
    );
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function readRecentFileChanges(): Promise<string[]> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const run = promisify(exec);

    // Commit edilmemiş (modified + untracked) dosyalar
    const { stdout } = await run(
      'cd /home/sovranamr/projects/foreman && (git diff --name-only HEAD; git ls-files --others --exclude-standard) | sort -u | head -15',
      { timeout: 5000 }
    );
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════
// USER CONTEXT
// ═══════════════════════════════════════════

async function readUserContext(): Promise<Record<string, string>> {
  const ctx: Record<string, string> = {};

  try {
    // Config'den
    if (existsSync(`${FOREMAN_DIR}/config.json`)) {
      const config = JSON.parse(await readFile(`${FOREMAN_DIR}/config.json`, 'utf-8'));
      if (config.telegram?.allowedSenders?.[0]) {
        ctx.chatId = String(config.telegram.allowedSenders[0]);
      }
    }

    // Konuşma geçmişinden isim
    const convos = await readConversations();
    if (convos.length > 0) {
      ctx.userName = convos[0].senderName;
      ctx.lastMessageTime = new Date(convos[0].lastActivity).toLocaleString('tr-TR');
      ctx.totalMessages = String(convos[0].totalMessages);
    }
  } catch {
    // Sorun değil
  }

  return ctx;
}

// ═══════════════════════════════════════════
// PENDING TASKS — Açık görevler, yarım kalan işler
// ═══════════════════════════════════════════

async function readPendingTasks(): Promise<string[]> {
  const tasks: string[] = [];

  // Chain'lerden açık olanlar
  const chains = await readChains();
  for (const chain of chains) {
    if (chain.status === 'active' || chain.status === 'in_progress') {
      tasks.push(`[${chain.layer}] ${chain.name}`);
    }
  }

  // Task queue'dan
  try {
    const TASK_FILE = `${FOREMAN_DIR}/task-queue.json`;
    if (existsSync(TASK_FILE)) {
      const data = JSON.parse(await readFile(TASK_FILE, 'utf-8'));
      const queuedTasks = (data.tasks || []).filter(
        (t: any) => t.status === 'queued' || t.status === 'in_progress'
      );
      for (const t of queuedTasks) {
        tasks.push(`[görev] ${t.title || t.description || t.id}`);
      }
    }
  } catch {
    // Sorun değil
  }

  return tasks;
}

// ═══════════════════════════════════════════
// SUMMARY GENERATOR — Her şeyi doğal dile çevir
// ═══════════════════════════════════════════

function generateSummary(ctx: AwarenessContext): string {
  const parts: string[] = [];
  const now = new Date();
  const hour = now.getHours();

  // 1. Son konuşma
  if (ctx.lastConversation) {
    const conv = ctx.lastConversation;
    const ago = Math.floor((Date.now() - conv.lastActivity) / 60000);
    const agoText = ago < 60
      ? `${ago} dakika önce`
      : ago < 1440
        ? `${Math.floor(ago / 60)} saat önce`
        : `${Math.floor(ago / 1440)} gün önce`;

    parts.push(
      `${conv.senderName} ile son konuşma ${agoText}. ` +
      `Toplam ${conv.totalMessages} mesaj paylaştık.`
    );

    if (conv.topics.length > 0) {
      parts.push(`Son konuşulan konular: ${conv.topics.slice(0, 5).join(', ')}.`);
    }

    // Son kullanıcı mesajı
    const lastUserMsg = [...conv.recentMessages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      parts.push(`Kullanıcının son mesajı: "${lastUserMsg.snippet}"`);
    }
  }

  // 2. Yapılacaklar
  if (ctx.pendingTasks.length > 0) {
    parts.push(`Açık görevler (${ctx.pendingTasks.length}): ${ctx.pendingTasks.slice(0, 3).join('; ')}`);
  } else {
    parts.push('Şu an açık görev yok.');
  }

  // 3. Son yapılan işler
  if (ctx.activeChains.length > 0) {
    const recent = ctx.activeChains[0];
    parts.push(`Son çalışılan: "${recent.name}" (${recent.layer}, ${recent.status}).`);
  }

  // 4. Git aktivitesi
  if (ctx.recentGitActivity.length > 0) {
    parts.push(`Son commit: "${ctx.recentGitActivity[0]}"`);
  }

  // 5. Dosya değişiklikleri
  if (ctx.recentFileChanges.length > 0) {
    parts.push(`Son 24 saatte ${ctx.recentFileChanges.length} dosya değişti.`);
  }

  // 6. Zaman bağlamı
  if (hour >= 0 && hour < 7) {
    parts.push('Gece geç saatler — kullanıcı muhtemelen uyuyor.');
  } else if (hour >= 7 && hour < 9) {
    parts.push('Sabah erken — yeni güne başlangıç zamanı.');
  } else if (hour >= 9 && hour < 12) {
    parts.push('Sabah — çalışma saatleri.');
  } else if (hour >= 12 && hour < 14) {
    parts.push('Öğle arası.');
  } else if (hour >= 14 && hour < 18) {
    parts.push('Öğleden sonra — aktif çalışma zamanı.');
  } else if (hour >= 18 && hour < 21) {
    parts.push('Akşam saatleri.');
  } else {
    parts.push('Gece — günün kapanışı.');
  }

  return parts.join(' ');
}

// ═══════════════════════════════════════════
// MAIN — Awareness Context oluştur
// ═══════════════════════════════════════════

export async function gatherAwareness(): Promise<AwarenessContext> {
  // Paralel oku — hızlı ol
  const [conversations, chains, gitActivity, fileChanges, userContext, pendingTasks] =
    await Promise.all([
      readConversations(),
      readChains(),
      readRecentGitActivity(),
      readRecentFileChanges(),
      readUserContext(),
      readPendingTasks(),
    ]);

  // En aktif konuşma
  const lastConversation = conversations.length > 0
    ? conversations.sort((a, b) => b.lastActivity - a.lastActivity)[0]
    : null;

  // Chain'leri ayır
  const activeChains = chains.filter(c => c.status === 'active' || c.status === 'in_progress');
  const completedChains = chains.filter(c => c.status === 'completed' || c.status === 'done');

  const ctx: AwarenessContext = {
    lastConversation,
    activeChains,
    completedChains,
    recentGitActivity: gitActivity,
    recentFileChanges: fileChanges,
    pendingTasks,
    userContext,
    summary: '',
    updatedAt: Date.now(),
  };

  // Summary'yi en son yap — hepsini biliyor olacak
  ctx.summary = generateSummary(ctx);

  return ctx;
}

/**
 * Awareness'ı kısa metin olarak döndür — heartbeat iç sesi için
 */
export async function getAwarenessBrief(): Promise<string> {
  const ctx = await gatherAwareness();
  return ctx.summary;
}

/**
 * Son konuşmadaki kullanıcının son mesajını döndür
 */
export async function getLastUserMessage(): Promise<string | null> {
  const conversations = await readConversations();
  if (conversations.length === 0) return null;

  const latest = conversations.sort((a, b) => b.lastActivity - a.lastActivity)[0];
  const lastUser = [...latest.recentMessages].reverse().find(m => m.role === 'user');
  return lastUser?.snippet || null;
}

/**
 * Açık görevleri döndür
 */
export async function getOpenTasks(): Promise<string[]> {
  return readPendingTasks();
}

// ═══════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

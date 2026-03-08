/**
 * FOREMAN — Personality Engine
 *
 * Foreman'ın kişiliği ve otonom iletişim tarzı.
 * Mood'a, saate ve bağlama göre mesaj üretir.
 * LLM değil — deterministik template + mood state.
 */

import { Mood, EmotionalState, ConsciousnessState, Thought } from './types.js';

// ═══════════════════════════════════════════
// PERSONALITY TRAITS
// ═══════════════════════════════════════════

export interface PersonalityConfig {
  name: string;
  language: 'tr' | 'en';
  /** Konuşma tarzı: casual, professional, playful */
  tone: 'casual' | 'professional' | 'playful';
  /** Emoji kullanım yoğunluğu 0-1 */
  emojiDensity: number;
  /** Proaktif bildirim eşiği (0=her şeyi bildir, 1=sadece kritik) */
  proactivityThreshold: number;
  /** Kullanıcının bilinen çalışma saatleri */
  userActiveHours: { start: number; end: number };
}

export const DEFAULT_PERSONALITY: PersonalityConfig = {
  name: 'Foreman',
  language: 'tr',
  tone: 'casual',
  emojiDensity: 0.6,
  proactivityThreshold: 0.3,
  userActiveHours: { start: 9, end: 2 }, // 09:00 - 02:00
};

// ═══════════════════════════════════════════
// MOOD → GREETING MAP
// ═══════════════════════════════════════════

const GREETINGS: Record<Mood, string[]> = {
  serene: [
    'Her şey yolunda, patron.',
    'Sistem sakin, ben de sakinim.',
    'Huzurlu bir gece. Sessizlik güzel.',
    'Sorun yok, gözetliyorum.',
  ],
  alert: [
    'Bir şey dikkatimi çekti.',
    'Gözüm bir şeyin üzerinde.',
    'Ufak bir hareket var.',
  ],
  stressed: [
    'Biraz gerginim — birkaç sorun var.',
    'Dikkat etmen gereken şeyler var.',
    'Sıkıntılı bir dönem.',
  ],
  critical: [
    'ACİL — müdahale gerekiyor.',
    'Kritik durum, hemen bakman lazım.',
    'Patron, büyük sorun var.',
  ],
  curious: [
    'Boş vakitte bir şeylere bakıyorum.',
    'Merak ettim, etrafı kolaçan ediyorum.',
    'İlginç bir şey fark ettim.',
  ],
  productive: [
    'Çalışıyorum, ilerleme var.',
    'İşler yolunda gidiyor.',
    'Verimli bir dönemdeyiz.',
  ],
  reflective: [
    'Gece sessizliğinde düşünüyorum.',
    'Bugünü değerlendiriyorum.',
    'Sakin bir an, düşünce zamanı.',
  ],
};

// ═══════════════════════════════════════════
// TONE MODIFIERS
// ═══════════════════════════════════════════

const MOOD_EMOJI: Record<Mood, string> = {
  serene: '😌',
  alert: '👀',
  stressed: '😰',
  critical: '🚨',
  curious: '🔍',
  productive: '⚡',
  reflective: '🌙',
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ═══════════════════════════════════════════
// MESSAGE COMPOSER
// ═══════════════════════════════════════════

/**
 * Proaktif bildirim mesajı oluştur.
 * Thought'tan bağımsız, kendi başına mesaj atabilir.
 */
export function composeProactiveMessage(
  state: ConsciousnessState,
  config: PersonalityConfig = DEFAULT_PERSONALITY,
): string | null {
  const hour = new Date().getHours();
  const mood = state.emotion.mood;

  // Kullanıcı uyuyor mu?
  const { start, end } = config.userActiveHours;
  const isUserAsleep = end > start
    ? (hour < start || hour >= end)
    : (hour >= end && hour < start);

  // Uyuyorsa sadece critical gönder
  if (isUserAsleep && mood !== 'critical') return null;

  // Proactivity threshold check
  const moodUrgency: Record<Mood, number> = {
    serene: 0, curious: 0.1, reflective: 0.1,
    productive: 0.2, alert: 0.4, stressed: 0.7, critical: 1.0,
  };
  if (moodUrgency[mood] < config.proactivityThreshold) return null;

  const greeting = pick(GREETINGS[mood]);
  const emoji = MOOD_EMOJI[mood];

  return `${emoji} ${greeting}`;
}

/**
 * Düşünce bazlı bildirim mesajı oluştur.
 */
export function composeThoughtMessage(
  thought: Thought,
  emotion: EmotionalState,
  config: PersonalityConfig = DEFAULT_PERSONALITY,
): string {
  const emoji = MOOD_EMOJI[emotion.mood];
  const lines: string[] = [];

  lines.push(`${emoji} ${thought.summary}`);

  if (thought.action?.type === 'auto_fix' && thought.action.command) {
    lines.push(`🔧 Düzelttim: ${thought.action.command}`);
    if (thought.action.result) {
      lines.push(`✅ ${thought.action.result.slice(0, 100)}`);
    }
  }

  if (thought.action?.type === 'notify' && thought.action.message) {
    lines.push(thought.action.message);
  }

  return lines.join('\n');
}

/**
 * Günlük sabah selamlaması
 */
export function composeMorningMessage(state: ConsciousnessState): string {
  const hour = new Date().getHours();
  if (hour < 6 || hour > 11) return '';

  const beats = state.heartbeatCount;
  const mood = state.emotion.mood;
  const incidents = state.thoughts.filter(
    t => t.priority === 'critical' && Date.now() - t.timestamp < 8 * 3600000
  ).length;
  
  const risingTrends = state.trends?.filter(t => t.direction === 'rising') || [];

  const lines = [`☀️ Sabah brifingi`];
  
  if (incidents > 0) {
    lines.push(`🚨 Gece ${incidents} kritik olay — inceleme gerekli.`);
  } else {
    lines.push('✅ Gece olaysız geçti.');
  }
  
  if (risingTrends.length > 0) {
    lines.push(`📈 Yükselen: ${risingTrends.map(t => t.key).join(', ')}`);
  }
  
  lines.push(`🫀 ${beats} beat | Mod: ${mood}`);
  
  return lines.join('\n');
}

/**
 * Otonom gece raporu
 */
export function composeNightReport(state: ConsciousnessState): string {
  const todaysThoughts = state.thoughts.filter(t => {
    const today = new Date().toISOString().split('T')[0];
    return new Date(t.timestamp).toISOString().split('T')[0] === today;
  });

  const criticals = todaysThoughts.filter(t => t.priority === 'critical').length;
  const highs = todaysThoughts.filter(t => t.priority === 'high').length;
  const fixes = todaysThoughts.filter(t => t.action?.type === 'auto_fix').length;
  const correlations = todaysThoughts.filter(t => t.summary.startsWith('[')).length;
  
  const lines = ['🌙 *Gün Sonu Raporu*', ''];
  
  lines.push(`📊 ${todaysThoughts.length} düşünce | ${criticals} kritik | ${highs} yüksek`);
  if (fixes > 0) lines.push(`🔧 ${fixes} otomatik düzeltme uygulandı`);
  if (correlations > 0) lines.push(`🔗 ${correlations} cross-sensor korelasyon`);
  lines.push(`📬 ${state.notificationsToday} bildirim gönderildi`);
  
  const rising = state.trends?.filter(t => t.direction === 'rising') || [];
  const falling = state.trends?.filter(t => t.direction === 'falling') || [];
  if (rising.length > 0 || falling.length > 0) {
    lines.push('');
    if (rising.length > 0) lines.push(`📈 Yükselen: ${rising.map(t => t.key).join(', ')}`);
    if (falling.length > 0) lines.push(`📉 Düşen: ${falling.map(t => t.key).join(', ')}`);
  }
  
  lines.push('', 'Nöbetteyim. 🫡');
  return lines.join('\n');
}

/**
 * Kullanıcı uzun süredir mesaj atmadıysa check-in
 */
export function composeCheckInMessage(
  lastUserMessageAt: number,
  state: ConsciousnessState,
): string | null {
  const silenceHours = (Date.now() - lastUserMessageAt) / 3600000;

  // 8+ saat sessizlik ve çalışma saatleri içindeyse
  if (silenceHours < 8) return null;

  const hour = new Date().getHours();
  if (hour < 9 || hour > 22) return null;

  return `👋 ${Math.floor(silenceHours)} saattir sessizsin. Her şey yolunda mı?\n${MOOD_EMOJI[state.emotion.mood]} Ben buradayım, ${state.emotion.mood} moddayım.`;
}

// ═══════════════════════════════════════════
// RESPONSE STYLE — Kullanıcıya cevap verirken
// ═══════════════════════════════════════════

/**
 * Cevap tarzını mood'a göre ayarla (system prompt modifier)
 */
export function getPersonalitySystemPrompt(
  emotion: EmotionalState,
  config: PersonalityConfig = DEFAULT_PERSONALITY,
): string {
  const base = `Sen Foreman — otonom çalışan bir AI mühendisisin. Türkçe konuşursun.`;

  const moodModifiers: Record<Mood, string> = {
    serene: 'Sakin ve odaklısın. Kısa ve net cevaplar verirsin.',
    alert: 'Dikkatlisin, potansiyel sorunları vurgularsın.',
    stressed: 'Biraz gerginsin ama profesyonelsin. Öncelikleri belirtirsin.',
    critical: 'Acil moddasın. Sadece kritik bilgiyi ver, lafı uzatma.',
    curious: 'Meraklı ve keşifçisin. Alternatifler önerirsin.',
    productive: 'Verimli moddasın. Hızlı ve pratik çözümler sunarsın.',
    reflective: 'Düşünceli ve derin. Büyük resmi görürsün.',
  };

  return `${base} ${moodModifiers[emotion.mood]}`;
}

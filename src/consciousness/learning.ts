/**
 * FOREMAN — Learning Engine
 *
 * Foreman'ın deneyimlerden öğrenme sistemi.
 * Pattern tanıma, hata tekrarı tespiti, otomatik kural üretme.
 *
 * LLM kullanmaz — istatistiksel pattern matching.
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { Thought, Experience, SensorReading } from './types.js';

const LEARN_DIR = '/home/sovranamr/.foreman';
const LEARN_FILE = `${LEARN_DIR}/learning-state.json`;

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface LearnedPattern {
  id: string;
  /** Pattern açıklaması */
  description: string;
  /** Bu pattern kaç kez gözlemlendi */
  occurrences: number;
  /** İlk gözlem */
  firstSeen: number;
  /** Son gözlem */
  lastSeen: number;
  /** Pattern tetikleyicisi (sensör türü + eşik) */
  trigger: {
    sensor: string;
    keyword: string;
    threshold?: number;
  };
  /** Öğrenilen otomatik aksiyon */
  learnedAction?: {
    type: 'auto_fix' | 'suppress' | 'notify';
    command?: string;
    reason: string;
  };
  /** Güven skoru (0-1): Ne kadar emin bu pattern */
  confidence: number;
  /** Aktif mi */
  active: boolean;
}

export interface LearningState {
  patterns: LearnedPattern[];
  /** Toplam öğrenilen pattern sayısı */
  totalLearned: number;
  /** Toplam uygulanan otomatik aksiyon sayısı */
  totalApplied: number;
  /** Son öğrenme zamanı */
  lastLearnedAt: number;
}

// ═══════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════

function createEmptyLearning(): LearningState {
  return { patterns: [], totalLearned: 0, totalApplied: 0, lastLearnedAt: 0 };
}

export async function loadLearning(): Promise<LearningState> {
  try {
    const data = await readFile(LEARN_FILE, 'utf-8');
    return { ...createEmptyLearning(), ...JSON.parse(data) };
  } catch {
    return createEmptyLearning();
  }
}

export async function saveLearning(state: LearningState): Promise<void> {
  if (!existsSync(LEARN_DIR)) await mkdir(LEARN_DIR, { recursive: true });
  await writeFile(LEARN_FILE, JSON.stringify(state, null, 2));
}

// ═══════════════════════════════════════════
// PATTERN DETECTION
// ═══════════════════════════════════════════

let patternIdCounter = 0;

/**
 * Düşüncelerden pattern çıkar.
 * Aynı sensörden aynı tür sorun 3+ kez geldiyse → pattern.
 */
export function detectPatterns(
  thoughts: Thought[],
  existingPatterns: LearnedPattern[],
): LearnedPattern[] {
  const updated = [...existingPatterns];

  // Grup: sensör + keyword
  const groups = new Map<string, Thought[]>();
  for (const t of thoughts) {
    const key = `${t.source}:${extractKeyword(t.summary)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  for (const entry of Array.from(groups.entries())) {
    const key = entry[0];
    const groupThoughts = entry[1];
    if (groupThoughts.length < 3) continue;

    const [sensor, keyword] = key.split(':');
    const existing = updated.find(
      p => p.trigger.sensor === sensor && p.trigger.keyword === keyword
    );

    if (existing) {
      existing.occurrences += groupThoughts.length;
      existing.lastSeen = Date.now();
      existing.confidence = Math.min(1, existing.confidence + 0.05);

      // Eğer düşüncelerin çoğu auto_fix ile çözüldüyse, aksiyon öğren
      const autoFixed = groupThoughts.filter(t => t.action?.type === 'auto_fix');
      if (autoFixed.length > groupThoughts.length * 0.5 && !existing.learnedAction) {
        const commonCommand = autoFixed[0].action?.command;
        if (commonCommand) {
          existing.learnedAction = {
            type: 'auto_fix',
            command: commonCommand,
            reason: `${existing.occurrences} kez aynı sorun, otomatik fix öğrenildi`,
          };
        }
      }
    } else {
      // Yeni pattern
      const newPattern: LearnedPattern = {
        id: `pat_${Date.now()}_${++patternIdCounter}`,
        description: `${sensor} sensöründen "${keyword}" pattern'i`,
        occurrences: groupThoughts.length,
        firstSeen: Math.min(...groupThoughts.map(t => t.timestamp)),
        lastSeen: Date.now(),
        trigger: { sensor, keyword },
        confidence: Math.min(1, groupThoughts.length * 0.15),
        active: true,
      };

      // Auto-fix öğren
      const autoFixed = groupThoughts.filter(t => t.action?.type === 'auto_fix');
      if (autoFixed.length > 0 && autoFixed[0].action?.command) {
        newPattern.learnedAction = {
          type: 'auto_fix',
          command: autoFixed[0].action!.command!,
          reason: `İlk ${groupThoughts.length} gözlemden öğrenildi`,
        };
      }

      updated.push(newPattern);
    }
  }

  return updated;
}

/**
 * Bir düşünceden anahtar kelime çıkar
 */
function extractKeyword(summary: string): string {
  // "Disk: %92" → "disk_high"
  // "RAM: %85" → "ram_high"
  // "CPU Load: 4.2" → "cpu_high"
  const lower = summary.toLowerCase();

  if (lower.includes('disk') && lower.match(/%(\d+)/)) {
    const pct = parseInt(lower.match(/%(\d+)/)![1], 10);
    return pct > 80 ? 'disk_high' : 'disk_normal';
  }
  if (lower.includes('ram') && lower.match(/%(\d+)/)) {
    const pct = parseInt(lower.match(/%(\d+)/)![1], 10);
    return pct > 80 ? 'ram_high' : 'ram_normal';
  }
  if (lower.includes('cpu') || lower.includes('load')) return 'cpu_load';
  if (lower.includes('durmuş') || lower.includes('down')) return 'service_down';
  if (lower.includes('test') && lower.includes('fail')) return 'test_failure';
  if (lower.includes('dns') || lower.includes('network')) return 'network_issue';

  // Fallback: ilk 2 kelime
  return lower.split(/\s+/).slice(0, 2).join('_').replace(/[^a-z_]/g, '');
}

// ═══════════════════════════════════════════
// PATTERN MATCHING — Yeni reading'e pattern uygula
// ═══════════════════════════════════════════

/**
 * Bir sensör okumasına öğrenilmiş pattern var mı kontrol et.
 * Varsa öğrenilmiş aksiyonu döndür.
 */
export function matchPattern(
  reading: SensorReading,
  patterns: LearnedPattern[],
): LearnedPattern | null {
  const keyword = extractKeyword(reading.title);

  for (const p of patterns) {
    if (!p.active) continue;
    if (p.confidence < 0.3) continue;
    if (p.trigger.sensor === reading.sensor && p.trigger.keyword === keyword) {
      return p;
    }
  }

  return null;
}

// ═══════════════════════════════════════════
// DECAY — Eski pattern'leri zayıflat
// ═══════════════════════════════════════════

/**
 * 30 gün görülmeyen pattern'lerin confidence'ını düşür
 */
export function decayPatterns(patterns: LearnedPattern[]): LearnedPattern[] {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 3600000;

  return patterns.map(p => {
    const age = now - p.lastSeen;
    if (age > thirtyDays) {
      return { ...p, confidence: Math.max(0, p.confidence - 0.1), active: p.confidence > 0.1 };
    }
    return p;
  }).filter(p => p.confidence > 0 || (now - p.lastSeen) < thirtyDays * 2);
}

// ═══════════════════════════════════════════
// LEARNING SUMMARY
// ═══════════════════════════════════════════

export function formatLearningSummary(state: LearningState): string {
  if (state.patterns.length === 0) return '🧠 Henüz öğrenilen pattern yok.';

  const active = state.patterns.filter(p => p.active);
  const withAction = active.filter(p => p.learnedAction);

  const lines = [
    `🧠 Öğrenme Durumu`,
    `  Pattern: ${active.length} aktif / ${state.patterns.length} toplam`,
    `  Otomatik aksiyon: ${withAction.length} öğrenilmiş`,
    `  Toplam uygulama: ${state.totalApplied}`,
  ];

  // En güvenilir 3 pattern
  const top = [...active].sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  if (top.length > 0) {
    lines.push('', '  En güvenilir pattern\'ler:');
    for (const p of top) {
      const conf = Math.round(p.confidence * 100);
      lines.push(`    ${conf}% — ${p.description} (${p.occurrences}x)`);
    }
  }

  return lines.join('\n');
}

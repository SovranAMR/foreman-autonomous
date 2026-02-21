/**
 * FOREMAN — Terminal Animations
 *
 * Gerçek yanıp sönen, hareket eden CLI animasyonları.
 * ANSI escape kodları ile cursor kontrol, frame-based rendering.
 *
 * - Çekiç vuran dwarf (4 frame loop)
 * - Kıvılcım yağmuru
 * - Forge ateşi (breathing efekt)
 * - Phase geçiş animasyonu
 * - Progress anvil
 */

import { brand, grad } from "./theme.js";

// ─── ANSI HELPERS ────────────────────────────────────────────

const ESC = "\x1b[";
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const CLEAR_LINE = `${ESC}2K`;
const MOVE_UP = (n: number) => `${ESC}${n}A`;
const MOVE_COL = (n: number) => `${ESC}${n}G`;
const SAVE_POS = `${ESC}s`;
const RESTORE_POS = `${ESC}u`;

function clearLines(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    s += MOVE_UP(1) + CLEAR_LINE;
  }
  return s;
}

// ─── DWARF FORGE ANIMATION ──────────────────────────────────

const DWARF_FRAMES_RAW = [
  // Frame 0: Bekleme — çekiç yukarıda
  [
    `         .  ·  .         `,
    `        ╔═╗  /\\         `,
    `        ║▓║ /  \\        `,
    `        ╚╩╝ ◣══◢        `,
    `        /║\\ ║▓▓║        `,
    `        / \\ ╚══╝        `,
    `       /   \\ ░▒▓        `,
  ],
  // Frame 1: Çekiç iniyor
  [
    `                         `,
    `        ╔═╗   *         `,
    `        ║▓║\\             `,
    `        ╚╩╝ ◣══◢        `,
    `        /║\\ ║▓▓║        `,
    `        / \\ ╚══╝        `,
    `       /   \\ ░▒▓        `,
  ],
  // Frame 2: VURUŞ! Kıvılcımlar!
  [
    `      *  ✦  *    ✦      `,
    `        ╔═╗  ✧    *     `,
    `        ║▓╠═◣══◢  ✦    `,
    `        ╚╩╝ ║▓▓║   *   `,
    `     ✦  /║\\ ╚══╝  ✧    `,
    `        / \\ ░▒▓    ✦   `,
    `     *  /   \\  ✦  *     `,
  ],
  // Frame 3: Kıvılcımlar sönüyor
  [
    `           ·        ·   `,
    `        ╔═╗    ·        `,
    `        ║▓║  ◣══◢  ·   `,
    `        ╚╩╝ ║▓▓║       `,
    `        /║\\ ╚══╝       `,
    `        / \\ ░▒▓  ·     `,
    `       /   \\            `,
  ],
];

function colorDwarfFrame(frameIdx: number): string[] {
  const raw = DWARF_FRAMES_RAW[frameIdx];
  return raw.map(line => {
    return line
      .replace(/╔═╗|║▓║|╚╩╝|║▓╠═/g, m => brand.steel(m))
      .replace(/◣══◢/g, m => brand.ember(m))
      .replace(/║▓▓║|╚══╝/g, m => brand.ember(m))
      .replace(/\/║\\/g, m => brand.dim(m))
      .replace(/\/ \\/g, m => brand.dim(m))
      .replace(/\/   \\/g, m => brand.dim(m))
      .replace(/░▒▓/g, m => brand.orange(m))
      .replace(/✦/g, m => brand.gold(m))
      .replace(/✧/g, m => brand.orange(m))
      .replace(/\*/g, m => brand.ember(m))
      .replace(/·/g, m => brand.dim(m));
  });
}

/**
 * Çekiç vuran dwarf animasyonu.
 * @param durationMs - toplam süre (ms)
 * @param frameDelayMs - frame arası gecikme (ms)
 * @returns Promise — animasyon bitince resolve olur
 */
export async function animateDwarf(durationMs = 2400, frameDelayMs = 300): Promise<void> {
  const frameCount = DWARF_FRAMES_RAW.length;
  const totalFrames = Math.ceil(durationMs / frameDelayMs);
  const lineCount = DWARF_FRAMES_RAW[0].length;

  process.stdout.write(HIDE_CURSOR);

  // İlk frame'i bas
  const firstFrame = colorDwarfFrame(0);
  for (const line of firstFrame) {
    process.stdout.write(`    ${line}\n`);
  }

  for (let i = 1; i < totalFrames; i++) {
    await sleep(frameDelayMs);
    const frame = colorDwarfFrame(i % frameCount);

    // Önceki frame'i sil
    process.stdout.write(clearLines(lineCount));

    // Yeni frame'i bas
    for (const line of frame) {
      process.stdout.write(`    ${line}\n`);
    }
  }

  process.stdout.write(SHOW_CURSOR);
}

// ─── SPARK RAIN ──────────────────────────────────────────────

const SPARK_CHARS = ["✦", "✧", "*", "·", "˙", "∙", "⁺"];
const SPARK_COLORS = [brand.gold, brand.orange, brand.ember, brand.goldBright, brand.dim];

function randomSpark(): string {
  const char = SPARK_CHARS[Math.floor(Math.random() * SPARK_CHARS.length)];
  const color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
  return color(char);
}

/**
 * Kıvılcım yağmuru — genişlik boyunca rastgele kıvılcımlar.
 */
export async function animateSparkRain(
  width = 50,
  durationMs = 1200,
  frameDelayMs = 150,
): Promise<void> {
  const totalFrames = Math.ceil(durationMs / frameDelayMs);

  process.stdout.write(HIDE_CURSOR);
  process.stdout.write("\n"); // boş satır

  for (let i = 0; i < totalFrames; i++) {
    if (i > 0) process.stdout.write(MOVE_UP(1) + CLEAR_LINE);

    let line = "    ";
    for (let j = 0; j < width; j++) {
      if (Math.random() < 0.3) {
        line += randomSpark();
      } else {
        line += " ";
      }
    }
    process.stdout.write(line + "\n");

    await sleep(frameDelayMs);
  }

  process.stdout.write(SHOW_CURSOR);
}

// ─── FORGE FIRE (BREATHING) ──────────────────────────────────

const FIRE_FRAMES = [
  `    ${brand.ember("  (")}${brand.orange(" (")}${brand.gold(" )")}${brand.orange(" )")}${brand.ember(" )")}  `,
  `    ${brand.orange(" (")}${brand.gold("  (")}${brand.goldBright(" )")}${brand.gold("  )")}${brand.orange(")")}  `,
  `    ${brand.gold("(")}${brand.goldBright("  ( ")}${brand.white(")")}${brand.goldBright("  )")}${brand.gold(" )")} `,
  `    ${brand.orange(" (")}${brand.gold("  (")}${brand.goldBright(" )")}${brand.gold("  )")}${brand.orange(")")}  `,
  `    ${brand.ember("  (")}${brand.orange(" (")}${brand.gold(" )")}${brand.orange(" )")}${brand.ember(" )")}  `,
];

/**
 * Forge ateşi — nefes alıp veren alev animasyonu.
 */
export async function animateFire(durationMs = 1500, frameDelayMs = 200): Promise<void> {
  const totalFrames = Math.ceil(durationMs / frameDelayMs);

  process.stdout.write(HIDE_CURSOR);
  process.stdout.write(FIRE_FRAMES[0] + "\n");

  for (let i = 1; i < totalFrames; i++) {
    await sleep(frameDelayMs);
    process.stdout.write(MOVE_UP(1) + CLEAR_LINE);
    process.stdout.write(FIRE_FRAMES[i % FIRE_FRAMES.length] + "\n");
  }

  process.stdout.write(SHOW_CURSOR);
}

// ─── FORGE SPINNER ───────────────────────────────────────────

const SPINNER_FRAMES = [
  { char: "⠋", label: "ısıtılıyor...",   color: brand.ember },
  { char: "⠙", label: "ısıtılıyor...",   color: brand.orange },
  { char: "⠹", label: "dövülüyor...",    color: brand.gold },
  { char: "⠸", label: "dövülüyor...",    color: brand.goldBright },
  { char: "⠼", label: "şekilleniyor...", color: brand.green },
  { char: "⠴", label: "şekilleniyor...", color: brand.cyan },
  { char: "⠦", label: "sertleşiyor...", color: brand.purple },
  { char: "⠧", label: "soğuyor...",      color: brand.steel },
];

export interface SpinnerHandle {
  stop: (finalText?: string) => void;
}

/**
 * Forge spinner — uzun işlem beklerken dönen animasyon.
 * Durdurmak için handle.stop() çağır.
 */
export function startForgeSpinner(label?: string): SpinnerHandle {
  let frameIdx = 0;
  let running = true;

  process.stdout.write(HIDE_CURSOR);
  process.stdout.write("\n");

  const interval = setInterval(() => {
    if (!running) return;
    const f = SPINNER_FRAMES[frameIdx % SPINNER_FRAMES.length];
    const spark = randomSpark();
    const text = label ?? f.label;
    process.stdout.write(MOVE_UP(1) + CLEAR_LINE);
    process.stdout.write(`    ${f.color(f.char)} ${spark} ${brand.dim(text)}\n`);
    frameIdx++;
  }, 120);

  return {
    stop(finalText?: string) {
      running = false;
      clearInterval(interval);
      process.stdout.write(MOVE_UP(1) + CLEAR_LINE);
      if (finalText) {
        process.stdout.write(`    ${brand.green("✔")} ${finalText}\n`);
      }
      process.stdout.write(SHOW_CURSOR);
    },
  };
}

// ─── PHASE TRANSITION ────────────────────────────────────────

const PHASE_SYMBOLS: Record<string, string> = {
  vision:    "🔮",
  decompose: "⚒️",
  research:  "🔍",
  atomize:   "⚛️",
  execute:   "🔨",
  reflect:   "🪞",
  complete:  "⚔️",
};

/**
 * Phase geçiş animasyonu — eski phase sönerken yeni parlıyor.
 */
export async function animatePhaseTransition(
  fromPhase: string | null,
  toPhase: string,
): Promise<void> {
  const toIcon = PHASE_SYMBOLS[toPhase] ?? "▸";

  process.stdout.write(HIDE_CURSOR);

  // Fade in efekti: nokta nokta yazı beliriyor
  const name = toPhase.toUpperCase();
  const steps = [
    `    ${brand.dim("·")}`,
    `    ${brand.dim("· ·")}`,
    `    ${brand.dim("· · ·")}`,
    `    ${toIcon} ${brand.dim(name)}`,
    `    ${toIcon} ${brand.gold(name)}`,
    `    ${toIcon} ${brand.goldBright(name)} ${brand.gold("✦")}`,
  ];

  process.stdout.write("\n");

  for (const step of steps) {
    process.stdout.write(MOVE_UP(1) + CLEAR_LINE);
    process.stdout.write(step + "\n");
    await sleep(100);
  }

  process.stdout.write(SHOW_CURSOR);
}

// ─── PROGRESS ANVIL ──────────────────────────────────────────

/**
 * Anvil üzerinde progress — her adımda çekiç sesi.
 */
export async function animateProgressStrike(
  current: number,
  total: number,
  label: string,
): Promise<void> {
  const ratio = total > 0 ? current / total : 0;
  const barLen = 24;
  const filled = Math.round(ratio * barLen);
  const percent = `${(ratio * 100).toFixed(0)}%`;

  // Çekiç vuruş patternleri
  const strikes = ["⚒", "🔨", "⚒", "🔨"];
  const strike = strikes[current % strikes.length];

  // Kıvılcım patternleri
  const sparks = current % 3 === 0
    ? ` ${brand.gold("✦")}${brand.ember("✧")}${brand.gold("✦")}`
    : current % 3 === 1
    ? ` ${brand.gold("✦")}`
    : "";

  // Gradient bar: ember → orange → gold
  let bar = "";
  for (let i = 0; i < barLen; i++) {
    if (i < filled) {
      if (i < filled / 3) bar += brand.ember("█");
      else if (i < (filled * 2) / 3) bar += brand.orange("█");
      else bar += brand.gold("█");
    } else {
      bar += brand.dim("░");
    }
  }

  console.log(
    `    ${strike} ${bar} ${brand.bold(percent)}${sparks} ${brand.dim(label.slice(0, 18))}`
  );
}

// ─── COMPLETION FANFARE ──────────────────────────────────────

/**
 * Tamamlanma kutlaması — kıvılcım patlaması + metin.
 */
export async function animateCompletion(success: boolean): Promise<void> {
  process.stdout.write(HIDE_CURSOR);

  if (success) {
    // Kıvılcım patlaması
    const burstFrames = [
      `                    ${brand.gold("✦")}`,
      `               ${brand.ember("*")} ${brand.gold("✦")} ${brand.orange("✧")}`,
      `          ${brand.gold("✦")} ${brand.ember("*")} ${brand.goldBright("★")} ${brand.orange("✧")} ${brand.gold("✦")}`,
      `       ${brand.ember("✧")} ${brand.gold("✦")} ${brand.ember("*")} ${brand.goldBright("★")} ${brand.orange("✧")} ${brand.gold("✦")} ${brand.ember("*")}`,
      `          ${brand.gold("✦")} ${brand.ember("*")} ${brand.goldBright("★")} ${brand.orange("✧")} ${brand.gold("✦")}`,
      `               ${brand.ember("*")} ${brand.gold("✦")} ${brand.orange("✧")}`,
      `                    ${brand.gold("✦")}`,
    ];

    for (const line of burstFrames) {
      process.stdout.write(`    ${line}\n`);
      await sleep(80);
    }

    await sleep(200);

    // Sword ASCII
    console.log("");
    console.log(grad.forge("         ╔═══════════════════════╗"));
    console.log(grad.forge("         ║  ⚔️  BLADE FORGED!   ║"));
    console.log(grad.forge("         ╚═══════════════════════╝"));
  } else {
    // Sönen kor animasyonu
    const dimFrames = [
      `    ${brand.orange("( ( ( ")}${brand.ember("🔥")}${brand.orange(" ) ) )")}`,
      `    ${brand.dim("  ( (")} ${brand.ember("🔥")} ${brand.dim(") )  ")}`,
      `    ${brand.dim("    (")} ${brand.dim("·")} ${brand.dim(")    ")}`,
      `    ${brand.dim("      ·        ")}`,
    ];

    for (const line of dimFrames) {
      process.stdout.write(`${line}\n`);
      await sleep(250);
    }

    console.log("");
    console.log(`    ${brand.red("╔═══════════════════════╗")}`);
    console.log(`    ${brand.red("║  🔥  FORGE WENT DARK  ║")}`);
    console.log(`    ${brand.red("╚═══════════════════════╝")}`);
  }

  process.stdout.write(SHOW_CURSOR);
}

// ─── TYPING EFFECT ───────────────────────────────────────────

/**
 * Daktilo efekti — metin karakter karakter yazılır.
 */
export async function typeText(
  text: string,
  delayMs = 30,
  colorFn: (s: string) => string = brand.gold,
): Promise<void> {
  process.stdout.write(HIDE_CURSOR);

  for (const char of text) {
    process.stdout.write(colorFn(char));
    await sleep(delayMs);
  }
  process.stdout.write("\n");

  process.stdout.write(SHOW_CURSOR);
}

// ─── UTIL ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { sleep };

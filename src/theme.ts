/**
 * FOREMAN — Visual Theme
 *
 * Forge theme: hammer-striking smiths, sparks, ironworking.
 * Everything in CLI is vivid, animated, impressive.
 */

import chalk from "chalk";
import gradient from "gradient-string";
import figures from "figures";

// ─── BRAND COLORS ────────────────────────────────────────────

export const brand = {
  gold: chalk.hex("#F5A623"),
  goldBright: chalk.hex("#FFD700"),
  orange: chalk.hex("#FF6B35"),
  cyan: chalk.hex("#00D4FF"),
  purple: chalk.hex("#A855F7"),
  green: chalk.hex("#22C55E"),
  red: chalk.hex("#EF4444"),
  dim: chalk.hex("#6B7280"),
  ember: chalk.hex("#FF4500"),
  steel: chalk.hex("#B0C4DE"),
  white: chalk.white,
  bold: chalk.bold,
  bgGold: chalk.bgHex("#F5A623").black,
  bgRed: chalk.bgHex("#EF4444").white,
  bgGreen: chalk.bgHex("#22C55E").black,
  bgCyan: chalk.bgHex("#00D4FF").black,
  bgPurple: chalk.bgHex("#A855F7").white,
};

// ─── GRADIENTS ───────────────────────────────────────────────

export const grad: Record<string, (text: string) => string> = {
  logo: gradient(["#F5A623", "#FF6B35", "#A855F7"]),
  vision: gradient(["#FFD700", "#F5A623"]),
  strat: gradient(["#00D4FF", "#A855F7"]),
  exec: gradient(["#22C55E", "#00D4FF"]),
  fire: gradient(["#FF6B35", "#EF4444"]),
  forge: gradient(["#FF4500", "#FFD700", "#FF6B35"]),
  steel: gradient(["#B0C4DE", "#708090", "#B0C4DE"]),
  ember: gradient(["#EF4444", "#FF6B35", "#FFD700"]),
};

// ─── ICONS ───────────────────────────────────────────────────

export const icon = {
  // Phases — forge theme
  vision: "🔮",
  decompose: "⚒️",
  research: "🔍",
  atomize: "⚛️",
  execute: "🔨",
  verify: "🔬",
  reflect: "🪞",
  complete: "⚔️",

  // Status
  done: brand.green(figures.tick),
  fail: brand.red(figures.cross),
  warn: brand.gold("⚠"),
  block: brand.red("🚫"),
  pending: brand.dim("○"),
  active: brand.cyan("◉"),

  // Thought layers
  visioner: "🔮",
  strategist: "⚒️",
  researcher: "🔍",
  worker: "🔨",

  // Meta
  thought: "💭",
  chain: "🔗",
  token: "🪙",
  time: "⏱",
  arrow: brand.dim("→"),
  bar: brand.dim("│"),
  dash: brand.dim("─"),
  anvil: "⚒️",
  spark: "✦",
  flame: "🔥",
  shield: "🛡️",
};

// ─── ASCII ART ───────────────────────────────────────────────

export const LOGO = `
    ███████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ █████╗ ███╗   ██╗
    ██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔══██╗████╗  ██║
    █████╗  ██║   ██║██████╔╝█████╗  ██╔████╔██║███████║██╔██╗ ██║
    ██╔══╝  ██║   ██║██╔══██╗██╔══╝  ██║╚██╔╝██║██╔══██║██║╚██╗██║
    ██║     ╚██████╔╝██║  ██║███████╗██║ ╚═╝ ██║██║  ██║██║ ╚████║
    ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝`;

// Hammer-striking blacksmith — larger, more detailed forge animation
const DWARF_FRAMES = [
  // Frame 0: Waiting — hammer raised high
  `
        ${brand.gold("✦")}   ${brand.ember("·")}          ${brand.gold("·")}
               ${brand.orange("╱")}${brand.gold("█")}${brand.orange("╲")}
      ${brand.steel("╔═══╗")}  ${brand.orange("╱")}   ${brand.gold("╲")}
      ${brand.steel("║")}${brand.cyan("◈◈◈")}${brand.steel("║")} ${brand.orange("╱")}     ${brand.gold("╲")}
      ${brand.steel("║")}${brand.gold(" ▓ ")}${brand.steel("║")}
      ${brand.steel("╠═══╣")}  ${brand.ember("╔═══════╗")}
      ${brand.dim(" ╱║╲")}   ${brand.ember("║")}${brand.orange("▓▓▓▓▓▓▓")}${brand.ember("║")}
      ${brand.dim("╱ ║ ╲")}  ${brand.ember("╚═══════╝")}
     ${brand.dim("╱  ║  ╲")}  ${brand.orange("░░▒▒▓▓░░")}
     ${brand.dim("╱       ╲")}`,

  // Frame 1: Hammer swinging down
  `
                           ${brand.gold("·")}
      ${brand.steel("╔═══╗")}   ${brand.ember("·")}  ${brand.gold("✦")}
      ${brand.steel("║")}${brand.cyan("◈◈◈")}${brand.steel("║")}${brand.orange("╲")}${brand.gold("█")}${brand.orange("╱")}
      ${brand.steel("║")}${brand.gold(" ▓ ")}${brand.steel("║")}
      ${brand.steel("╠═══╣")}  ${brand.ember("╔═══════╗")}
      ${brand.dim(" ╱║╲")}   ${brand.ember("║")}${brand.orange("▓▓▓▓▓▓▓")}${brand.ember("║")}
      ${brand.dim("╱ ║ ╲")}  ${brand.ember("╚═══════╝")}
     ${brand.dim("╱  ║  ╲")}  ${brand.orange("░░▒▒▓▓░░")}
     ${brand.dim("╱       ╲")}
        ${brand.ember("·")}`,

  // Frame 2: STRIKE! Sparks explode!
  `
      ${brand.gold("✦")} ${brand.ember("*")} ${brand.gold("✦")}     ${brand.ember("*")} ${brand.gold("✦")}
      ${brand.steel("╔═══╗")} ${brand.ember("*")}  ${brand.orange("✧")}  ${brand.ember("*")}
      ${brand.steel("║")}${brand.cyan("◈◈◈")}${brand.steel("╠")}${brand.gold("═")}${brand.orange("█")}
      ${brand.steel("║")}${brand.gold(" ▓ ")}${brand.steel("║")}     ${brand.gold("✦")}  ${brand.ember("*")}
      ${brand.steel("╠═══╣")}  ${brand.ember("╔═══════╗")}
   ${brand.gold("✦")} ${brand.dim(" ╱║╲")}   ${brand.ember("║")}${brand.orange("▓█▓█▓█▓")}${brand.ember("║")} ${brand.gold("✦")}
      ${brand.dim("╱ ║ ╲")}  ${brand.ember("╚═══════╝")}  ${brand.ember("*")}
     ${brand.dim("╱  ║  ╲")}  ${brand.orange("░▒▓█▓▒░░")}
   ${brand.ember("*")} ${brand.dim("╱       ╲")} ${brand.gold("✦")} ${brand.ember("*")}`,

  // Frame 3: Sparks fading, embers glowing
  `
             ${brand.dim("·")}       ${brand.dim("·")}
      ${brand.steel("╔═══╗")}   ${brand.dim("·")}
      ${brand.steel("║")}${brand.cyan("◈◈◈")}${brand.steel("║")}  ${brand.ember("◣")}${brand.orange("═══")}${brand.ember("◢")}  ${brand.dim("·")}
      ${brand.steel("║")}${brand.gold(" ▓ ")}${brand.steel("║")}  ${brand.ember("║")}${brand.orange("▓▓▓")}${brand.ember("║")}
      ${brand.steel("╠═══╣")}  ${brand.ember("╔═══════╗")}
      ${brand.dim(" ╱║╲")}   ${brand.ember("║")}${brand.orange("▓▓▓▓▓▓▓")}${brand.ember("║")}
      ${brand.dim("╱ ║ ╲")}  ${brand.ember("╚═══════╝")}  ${brand.dim("·")}
     ${brand.dim("╱  ║  ╲")}  ${brand.orange("░░▒▒▓▓░░")}
     ${brand.dim("╱       ╲")}`,
];

// Spark lines
const SPARK_LINES = [
  `${brand.ember("·")} ${brand.gold("✦")} ${brand.ember("·")} ${brand.orange("✧")} ${brand.ember("·")} ${brand.gold("✦")} ${brand.ember("·")} ${brand.orange("✧")} ${brand.ember("·")} ${brand.gold("✦")} ${brand.ember("·")} ${brand.orange("✧")} ${brand.ember("·")} ${brand.gold("✦")} ${brand.ember("·")}`,
  `${brand.gold("✧")} ${brand.ember("·")} ${brand.gold("✦")} ${brand.ember("·")} ${brand.orange("✧")} ${brand.ember("·")} ${brand.gold("✦")} ${brand.ember("·")} ${brand.orange("✧")} ${brand.ember("·")} ${brand.gold("✦")} ${brand.ember("·")} ${brand.orange("✧")} ${brand.ember("·")} ${brand.gold("✦")}`,
];

// Mini anvil — small decoration
const MINI_ANVIL = `${brand.steel("⚒")} ${brand.dim("═══")} ${brand.ember("▓")} ${brand.dim("═══")} ${brand.steel("⚒")}`;

// ─── ANIMATED LOGO ───────────────────────────────────────────

export function printLogo() {
  console.log(grad.logo(LOGO));
  console.log("");
  console.log(`    ${SPARK_LINES[0]}`);
  console.log(brand.dim("    ⚒  Atomic Thought Chains — Forge Your Ideas  ⚒"));
  console.log(`    ${SPARK_LINES[1]}`);
  console.log("");
}

/**
 * Full forge intro — logo + dwarf + sparks.
 * Used only at the start of `foreman run`.
 */
export function printForgeIntro() {
  console.log(grad.logo(LOGO));
  console.log("");
  console.log(DWARF_FRAMES[2]); // strike frame
  console.log("");
  console.log(`    ${SPARK_LINES[0]}`);
  console.log(grad.forge("    ⚒  THE FORGE IS LIT — THOUGHTS WILL BE HAMMERED  ⚒"));
  console.log(`    ${SPARK_LINES[1]}`);
  console.log("");
}

/**
 * Mini forge banner at pipeline start.
 */
export function printForgeBanner(task: string) {
  const maxLen = 52;
  const trimmed = task.length > maxLen ? task.slice(0, maxLen - 3) + "..." : task;
  const w = Math.max(trimmed.length + 6, 40);

  console.log("");
  console.log(`    ${brand.ember("╔")}${brand.orange("═".repeat(w))}${brand.ember("╗")}`);
  console.log(`    ${brand.ember("║")} ${brand.gold("⚒")}  ${grad.forge(trimmed)}${" ".repeat(w - trimmed.length - 5)}${brand.ember("║")}`);
  console.log(`    ${brand.ember("╚")}${brand.orange("═".repeat(w))}${brand.ember("╝")}`);
  console.log("");
}

// ─── PHASE ANIMATIONS ────────────────────────────────────────

const PHASE_ART: Record<string, string> = {
  vision: `
    ${brand.gold("    ╭──────────────────────────────────╮")}
    ${brand.gold("    │")} ${brand.goldBright("🔮")} ${grad.vision("VISION — The Oracle Speaks")}      ${brand.gold("│")}
    ${brand.gold("    │")}  ${brand.dim("The forge needs direction...")}     ${brand.gold("│")}
    ${brand.gold("    ╰──────────────────────────────────╯")}`,

  decompose: `
    ${brand.cyan("    ╭──────────────────────────────────╮")}
    ${brand.cyan("    │")} ${brand.cyan("⚒️")} ${grad.strat("DECOMPOSE — Breaking the Ore")}    ${brand.cyan("│")}
    ${brand.cyan("    │")}  ${brand.dim("Raw material → workable pieces...")} ${brand.cyan("│")}
    ${brand.cyan("    ╰──────────────────────────────────╯")}`,

  research: `
    ${brand.purple("    ╭──────────────────────────────────╮")}
    ${brand.purple("    │")} ${brand.purple("🔍")} ${grad.strat("RESEARCH — Studying the Metal")}   ${brand.purple("│")}
    ${brand.purple("    │")}  ${brand.dim("Knowledge before the hammer...")}   ${brand.purple("│")}
    ${brand.purple("    ╰──────────────────────────────────╯")}`,

  atomize: `
    ${brand.orange("    ╭──────────────────────────────────╮")}
    ${brand.orange("    │")} ${brand.orange("⚛️")} ${grad.fire("ATOMIZE — Grain of the Steel")}    ${brand.orange("│")}
    ${brand.orange("    │")}  ${brand.dim("Down to the atomic level...")}      ${brand.orange("│")}
    ${brand.orange("    ╰──────────────────────────────────╯")}`,

  execute: `
    ${brand.green("    ╭──────────────────────────────────╮")}
    ${brand.green("    │")} ${brand.green("🔨")} ${grad.exec("EXECUTE — Hammer Strikes!")}       ${brand.green("│")}
    ${brand.green("    │")}  ${brand.dim("Each blow shapes the metal...")}    ${brand.green("│")}
    ${brand.green("    ╰──────────────────────────────────╯")}`,

  reflect: `
    ${brand.purple("    ╭──────────────────────────────────╮")}
    ${brand.purple("    │")} ${brand.purple("🪞")} ${grad.strat("REFLECT — Inspecting the Blade")}  ${brand.purple("│")}
    ${brand.purple("    │")}  ${brand.dim("Is the edge true?")}                ${brand.purple("│")}
    ${brand.purple("    ╰──────────────────────────────────╯")}`,

  complete: `
    ${brand.gold("    ╭──────────────────────────────────╮")}
    ${brand.gold("    │")} ${brand.gold("⚔️")} ${grad.forge("COMPLETE — The Blade is Forged")}   ${brand.gold("│")}
    ${brand.gold("    │")}  ${brand.dim("From raw thought to sharp edge.")}  ${brand.gold("│")}
    ${brand.gold("    ╰──────────────────────────────────╯")}`,
};

// ─── ANIMATED SPINNER FRAMES ─────────────────────────────────

export const FORGE_SPINNER = {
  frames: [
    `${brand.ember("⠋")} ${brand.gold("✦")} ${brand.dim("heating...")}`,
    `${brand.ember("⠙")} ${brand.orange("✧")} ${brand.dim("heating...")}`,
    `${brand.ember("⠹")} ${brand.gold("✦")} ${brand.dim("hammering...")}`,
    `${brand.ember("⠸")} ${brand.ember("*")} ${brand.dim("hammering...")}`,
    `${brand.ember("⠼")} ${brand.gold("✦")} ${brand.dim("shaping...")}`,
    `${brand.ember("⠴")} ${brand.orange("✧")} ${brand.dim("shaping...")}`,
    `${brand.ember("⠦")} ${brand.gold("✦")} ${brand.dim("tempering...")}`,
    `${brand.ember("⠧")} ${brand.ember("*")} ${brand.dim("cooling...")}`,
  ],
  interval: 120,
};

// ─── BOXES & OUTPUT ──────────────────────────────────────────

export function phaseHeader(phase: string, detail: string) {
  const art = PHASE_ART[phase];
  if (art) {
    console.log(art);
    if (detail) {
      console.log(`    ${brand.dim("    " + detail.slice(0, 56))}`);
    }
  } else {
    const phaseIcon = icon[phase as keyof typeof icon] ?? "▸";
    const colorFn = phase === "vision" ? brand.goldBright
      : phase === "research" ? brand.cyan
        : phase === "execute" ? brand.green
          : phase === "reflect" ? brand.purple
            : brand.white;

    console.log("");
    console.log(
      `    ${phaseIcon} ${colorFn(phase.toUpperCase().padEnd(12))} ${brand.dim(detail.slice(0, 56))}`
    );
  }
  console.log(`    ${brand.dim("─".repeat(40))}`);
}

export function thoughtLine(id: string, layer: string, confidence: number, tokens?: number) {
  const layerIcon = icon[layer as keyof typeof icon] ?? "•";
  const confColor = confidence >= 0.8 ? brand.green
    : confidence >= 0.5 ? brand.gold
      : brand.red;
  const confStr = confColor(`${(confidence * 100).toFixed(0)}%`);
  const tokenStr = tokens ? brand.dim(` ${icon.token}${tokens}`) : "";

  // Spark effect — on high confidence
  const sparkEffect = confidence >= 0.9
    ? ` ${brand.gold("✦")}${brand.ember("✦")}${brand.gold("✦")}`
    : confidence >= 0.8
      ? ` ${brand.gold("✦")}`
      : "";

  console.log(
    `    ${brand.dim(icon.bar)} ${layerIcon} ${brand.bold(id.padEnd(8))} ${confStr}${sparkEffect}${tokenStr}`
  );
}

export function blockLine(reason: string) {
  console.log("");
  console.log(`    ${brand.red("    ╔════════════════════════════════════╗")}`);
  console.log(`    ${brand.red("    ║")} 🚫 ${brand.red("BLOCKED — The Metal Cracks!")}    ${brand.red("║")}`);
  console.log(`    ${brand.red("    ╚════════════════════════════════════╝")}`);
  console.log(`    ${brand.dim("    " + reason.slice(0, 50))}`);
}

export function reflectionLine(atomCount: number, summary: string) {
  console.log("");
  console.log(`    ${icon.reflect} ${brand.purple("REFLECTION")} ${brand.dim(`(${atomCount} atoms forged)`)}`);
  console.log(`    ${brand.dim("    └")} ${summary.slice(0, 50)}`);
}

export function completionBox(thoughts: number, tokens: number, success: boolean) {
  console.log("");
  if (success) {
    console.log(`    ${brand.gold("╔══════════════════════════════════════════════╗")}`);
    console.log(`    ${brand.gold("║")}                                              ${brand.gold("║")}`);
    console.log(`    ${brand.gold("║")}  ${brand.gold("⚔️")}  ${grad.forge("THE BLADE IS FORGED")}                    ${brand.gold("║")}`);
    console.log(`    ${brand.gold("║")}                                              ${brand.gold("║")}`);
    console.log(`    ${brand.gold("║")}  ${icon.thought} Thoughts: ${brand.bold(String(thoughts).padEnd(6))}                    ${brand.gold("║")}`);
    console.log(`    ${brand.gold("║")}  ${icon.token} Tokens:   ${brand.bold(String(tokens).padEnd(6))}                    ${brand.gold("║")}`);
    console.log(`    ${brand.gold("║")}                                              ${brand.gold("║")}`);
    console.log(`    ${brand.gold("║")}  ${SPARK_LINES[0].slice(0, 40)}  ${brand.gold("║")}`);
    console.log(`    ${brand.gold("╚══════════════════════════════════════════════╝")}`);
  } else {
    console.log(`    ${brand.red("╔══════════════════════════════════════════════╗")}`);
    console.log(`    ${brand.red("║")}                                              ${brand.red("║")}`);
    console.log(`    ${brand.red("║")}  ${brand.red("🔥")}  ${brand.red("THE FORGE WENT DARK")}                    ${brand.red("║")}`);
    console.log(`    ${brand.red("║")}                                              ${brand.red("║")}`);
    console.log(`    ${brand.red("║")}  ${icon.thought} Thoughts: ${brand.bold(String(thoughts).padEnd(6))}                    ${brand.red("║")}`);
    console.log(`    ${brand.red("║")}  ${icon.token} Tokens:   ${brand.bold(String(tokens).padEnd(6))}                    ${brand.red("║")}`);
    console.log(`    ${brand.red("║")}                                              ${brand.red("║")}`);
    console.log(`    ${brand.red("╚══════════════════════════════════════════════╝")}`);
  }
}

// ─── STATUS TABLE ────────────────────────────────────────────

export function statusBox(data: {
  name: string;
  state: string;
  chains: number;
  thoughts: number;
  done: number;
  pending: number;
  blocked: number;
  tokens: number;
  session: string;
  activeChain?: string;
  activeThought?: string;
}) {
  const w = 48;
  const pad = (s: string, len: number) => s + " ".repeat(Math.max(0, len - s.length));

  const stateColor = data.state === "idle" ? brand.dim
    : data.state === "complete" ? brand.green
      : data.state === "blocked" ? brand.red
        : brand.cyan;

  // Progress bar
  const total = data.done + data.pending + data.blocked;
  const ratio = total > 0 ? data.done / total : 0;
  const barLen = 20;
  const filled = Math.round(ratio * barLen);
  const progressBar = brand.green("█".repeat(filled)) + brand.dim("░".repeat(barLen - filled));
  const percent = `${(ratio * 100).toFixed(0)}%`;

  console.log("");
  console.log(`    ${brand.gold("╔")}${brand.orange("═".repeat(w))}${brand.gold("╗")}`);
  console.log(`    ${brand.gold("║")} ${brand.gold("⚒")} ${grad.forge(pad(`FOREMAN — ${data.name}`, w - 4))} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("╠")}${brand.orange("═".repeat(w))}${brand.gold("╣")}`);
  console.log(`    ${brand.gold("║")}  State:    ${stateColor(pad(data.state, w - 13))} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  Progress: ${progressBar} ${pad(percent, w - 35)} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}                                                 ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  ${icon.chain} Chains:   ${pad(String(data.chains), w - 15)} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  ${icon.thought} Thoughts: ${pad(String(data.thoughts), w - 15)} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}    ${icon.done} Done:    ${pad(String(data.done), w - 15)} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}    ${icon.pending} Pending: ${pad(String(data.pending), w - 15)} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}    ${icon.block} Blocked: ${pad(String(data.blocked), w - 15)} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}                                                 ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  ${icon.token} Tokens:  ${pad(String(data.tokens), w - 14)} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("║")}  ${icon.time} Session: ${pad(data.session.slice(0, 19), w - 14)} ${brand.gold("║")}`);
  console.log(`    ${brand.gold("╚")}${brand.orange("═".repeat(w))}${brand.gold("╝")}`);

  if (data.activeChain) {
    console.log(`    ${icon.chain} Active: ${brand.cyan(data.activeChain)}`);
  }
  if (data.activeThought) {
    console.log(`    ${icon.thought} Active: ${brand.cyan(data.activeThought)}`);
  }
}

// ─── PROGRESS ANIMATIONS ─────────────────────────────────────

/**
 * Ironworking progress — called at each thought.
 * Does not update the last line in terminal (non-interactive), just prints.
 */
export function forgeProgress(current: number, total: number, label: string) {
  const ratio = total > 0 ? current / total : 0;
  const barLen = 24;
  const filled = Math.round(ratio * barLen);

  const hotBar = brand.ember("█".repeat(Math.min(filled, 8)))
    + brand.orange("█".repeat(Math.max(0, Math.min(filled - 8, 8))))
    + brand.gold("█".repeat(Math.max(0, filled - 16)));
  const coldBar = brand.dim("░".repeat(barLen - filled));
  const percent = `${(ratio * 100).toFixed(0)}%`;

  // Random spark
  const sparks = ["✦", "✧", "*", "·"];
  const spark = brand.gold(sparks[current % sparks.length]);

  console.log(
    `    ${spark} ${hotBar}${coldBar} ${brand.bold(percent)} ${brand.dim(label.slice(0, 20))}`
  );
}

/**
 * Divider — forge stili.
 */
export function forgeDivider() {
  console.log(`    ${brand.dim("─── ⚒ ")}${brand.ember("═══════════════════════════")}${brand.dim(" ⚒ ───")}`);
}

/**
 * Successful thought — small spark effect.
 */
export function thoughtSpark(id: string, confidence: number) {
  if (confidence >= 0.9) {
    console.log(`    ${brand.gold("    ✦ ✧ ✦")} ${brand.dim("perfect strike")} ${brand.gold("✦ ✧ ✦")}`);
  } else if (confidence >= 0.8) {
    console.log(`    ${brand.gold("    ✦")} ${brand.dim("clean hit")} ${brand.gold("✦")}`);
  }
}

// ─── DOCTOR DISPLAY ──────────────────────────────────────────

export function doctorHeader() {
  console.log("");
  console.log(`    ${brand.gold("⚒")} ${grad.forge("FORGE DIAGNOSTICS")}`);
  console.log(`    ${brand.dim("─".repeat(40))}`);
}

export function doctorItem(ok: boolean, label: string, detail?: string) {
  const statusIcon = ok ? icon.done : icon.fail;
  const detailStr = detail ? brand.dim(` (${detail})`) : "";
  console.log(`    ${statusIcon} ${label}${detailStr}`);
}

export function doctorFooter(allOk: boolean) {
  console.log(`    ${brand.dim("─".repeat(40))}`);
  if (allOk) {
    console.log(`    ${brand.green("⚔️  The forge is ready. Fire it up.")}`);
  } else {
    console.log(`    ${brand.red("🔥  Some tools need sharpening.")}`);
  }
  console.log("");
}

// ─── IDLE ANIMATIONS (mini art) ──────────────────────────────

export function printIdleForge() {
  console.log(`
         ${brand.ember(".")} ${brand.gold("·")} ${brand.ember(".")}
        ${brand.ember("·")} ${brand.orange(",")} ${brand.ember("·")}
       ${brand.steel("╔═════╗")}
       ${brand.steel("║")} ${brand.ember("▓▓▓")} ${brand.steel("║")}   ${brand.dim("The forge sleeps...")}
       ${brand.steel("║")} ${brand.orange("▓█▓")} ${brand.steel("║")}   ${brand.dim("Awaiting your command.")}
       ${brand.steel("╚══╦══╝")}
      ${brand.dim("═══")}${brand.steel("╩")}${brand.dim("═══")}
      ${brand.orange("░░▒▒▓▒▒░░")}
  `);
}

// Dwarf frames export for external animation
export { DWARF_FRAMES, SPARK_LINES, MINI_ANVIL };

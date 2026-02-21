/**
 * FOREMAN — Visual Theme
 *
 * Tüm CLI görsel sabitleri: renkler, ikonlar, box stilleri.
 * Tek kaynak — değiştirmek istersen sadece buraya dokun.
 */

import chalk from "chalk";
import gradient from "gradient-string";
import figures from "figures";

// ─── BRAND COLORS ────────────────────────────────────────────

export const brand = {
  gold:       chalk.hex("#F5A623"),
  goldBright: chalk.hex("#FFD700"),
  orange:     chalk.hex("#FF6B35"),
  cyan:       chalk.hex("#00D4FF"),
  purple:     chalk.hex("#A855F7"),
  green:      chalk.hex("#22C55E"),
  red:        chalk.hex("#EF4444"),
  dim:        chalk.hex("#6B7280"),
  white:      chalk.white,
  bold:       chalk.bold,
  bgGold:     chalk.bgHex("#F5A623").black,
  bgRed:      chalk.bgHex("#EF4444").white,
  bgGreen:    chalk.bgHex("#22C55E").black,
  bgCyan:     chalk.bgHex("#00D4FF").black,
  bgPurple:   chalk.bgHex("#A855F7").white,
};

// ─── GRADIENTS ───────────────────────────────────────────────

export const grad = {
  logo:   gradient(["#F5A623", "#FF6B35", "#A855F7"]),
  vision: gradient(["#FFD700", "#F5A623"]),
  strat:  gradient(["#00D4FF", "#A855F7"]),
  exec:   gradient(["#22C55E", "#00D4FF"]),
  fire:   gradient(["#FF6B35", "#EF4444"]),
};

// ─── ICONS ───────────────────────────────────────────────────

export const icon = {
  // Phases
  vision:    "🔮",
  decompose: "🧩",
  research:  "🔍",
  atomize:   "⚛️",
  execute:   "⚡",
  verify:    "🔬",
  reflect:   "🪞",
  complete:  "🏁",

  // Status
  done:      brand.green(figures.tick),
  fail:      brand.red(figures.cross),
  warn:      brand.gold("⚠"),
  block:     brand.red("🚫"),
  pending:   brand.dim("○"),
  active:    brand.cyan("◉"),

  // Thought layers
  visioner:    "🔮",
  strategist:  "🧩",
  researcher:  "🔍",
  worker:      "⚡",

  // Meta
  thought: "💭",
  chain:   "🔗",
  token:   "🪙",
  time:    "⏱",
  arrow:   brand.dim("→"),
  bar:     brand.dim("│"),
  dash:    brand.dim("─"),
};

// ─── ASCII LOGO ──────────────────────────────────────────────

export const LOGO = `
  ███████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ █████╗ ███╗   ██╗
  ██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔══██╗████╗  ██║
  █████╗  ██║   ██║██████╔╝█████╗  ██╔████╔██║███████║██╔██╗ ██║
  ██╔══╝  ██║   ██║██╔══██╗██╔══╝  ██║╚██╔╝██║██╔══██║██║╚██╗██║
  ██║     ╚██████╔╝██║  ██║███████╗██║ ╚═╝ ██║██║  ██║██║ ╚████║
  ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝`;

export function printLogo() {
  console.log(grad.logo(LOGO));
  console.log(brand.dim("  AI Agent Orchestrator — Atomic Thought Chains\n"));
}

// ─── BOXES ───────────────────────────────────────────────────

export function phaseHeader(phase: string, detail: string) {
  const icons: Record<string, string> = {
    vision: icon.vision,
    decompose: icon.decompose,
    research: icon.research,
    atomize: icon.atomize,
    execute: icon.execute,
    verify: icon.verify,
    reflect: icon.reflect,
    complete: icon.complete,
  };
  const phaseIcon = icons[phase] ?? "▸";
  const colorFn = phase === "vision" ? brand.goldBright
    : phase === "research" ? brand.cyan
    : phase === "execute" ? brand.green
    : phase === "reflect" ? brand.purple
    : brand.white;

  console.log("");
  console.log(
    `  ${phaseIcon} ${colorFn(phase.toUpperCase().padEnd(12))} ${brand.dim(detail.slice(0, 60))}`
  );
  console.log(`  ${brand.dim("─".repeat(56))}`);
}

export function thoughtLine(id: string, layer: string, confidence: number, tokens?: number) {
  const layerIcon = icon[layer as keyof typeof icon] ?? "•";
  const confColor = confidence >= 0.8 ? brand.green
    : confidence >= 0.5 ? brand.gold
    : brand.red;
  const confStr = confColor(`${(confidence * 100).toFixed(0)}%`);
  const tokenStr = tokens ? brand.dim(` ${icon.token}${tokens}`) : "";

  console.log(
    `  ${brand.dim(icon.bar)} ${layerIcon} ${brand.bold(id.padEnd(8))} ${confStr}${tokenStr}`
  );
}

export function blockLine(reason: string) {
  console.log(`  ${icon.block} ${brand.red("BLOCKED")} ${brand.dim(reason.slice(0, 50))}`);
}

export function reflectionLine(atomCount: number, summary: string) {
  console.log(`  ${icon.reflect} ${brand.purple("REFLECT")} ${brand.dim(`(${atomCount} atoms)`)} ${summary.slice(0, 40)}`);
}

export function completionBox(thoughts: number, tokens: number, success: boolean) {
  const line = "═".repeat(46);
  console.log("");
  console.log(`  ${brand.dim(line)}`);
  if (success) {
    console.log(`  ${icon.complete} ${brand.green("Pipeline tamamlandı")}`);
  } else {
    console.log(`  ${icon.block} ${brand.red("Pipeline durdu (BLOCK)")}`);
  }
  console.log(`     ${icon.thought} Thoughts: ${brand.bold(String(thoughts))}`);
  console.log(`     ${icon.token} Tokens:   ${brand.bold(String(tokens))}`);
  console.log(`  ${brand.dim(line)}`);
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
  const w = 44;
  const top    = `╭${"─".repeat(w)}╮`;
  const bottom = `╰${"─".repeat(w)}╯`;
  const sep    = `├${"─".repeat(w)}┤`;
  const pad = (s: string, len: number) => s + " ".repeat(Math.max(0, len - s.length));

  const stateColor = data.state === "idle" ? brand.dim
    : data.state === "complete" ? brand.green
    : data.state === "blocked" ? brand.red
    : brand.cyan;

  console.log(brand.gold(top));
  console.log(brand.gold("│") + grad.logo(` ◆ FOREMAN — ${data.name}`.padEnd(w)) + brand.gold("│"));
  console.log(brand.gold(sep));
  console.log(brand.gold("│") + `  State:    ${stateColor(pad(data.state, 31))}` + brand.gold("│"));
  console.log(brand.gold("│") + `  Chains:   ${pad(String(data.chains), 31)}` + brand.gold("│"));
  console.log(brand.gold("│") + `  Thoughts: ${pad(String(data.thoughts), 31)}` + brand.gold("│"));
  console.log(brand.gold("│") + `    ${icon.done} Done:    ${pad(String(data.done), 29)}` + brand.gold("│"));
  console.log(brand.gold("│") + `    ${icon.pending} Pending: ${pad(String(data.pending), 29)}` + brand.gold("│"));
  console.log(brand.gold("│") + `    ${icon.block} Blocked: ${pad(String(data.blocked), 29)}` + brand.gold("│"));
  console.log(brand.gold("│") + `  ${icon.token} Tokens: ${pad(String(data.tokens), 30)}` + brand.gold("│"));
  console.log(brand.gold("│") + `  ${icon.time} Session: ${pad(data.session.slice(0, 19), 29)}` + brand.gold("│"));
  console.log(brand.gold(bottom));

  if (data.activeChain) {
    console.log(`  ${icon.chain} Active: ${brand.cyan(data.activeChain)}`);
  }
  if (data.activeThought) {
    console.log(`  ${icon.thought} Active: ${brand.cyan(data.activeThought)}`);
  }
}

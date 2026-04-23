import { KimiProvider, loadKimiKey, DEFAULT_KIMI_MODEL, KIMI_MODELS } from "../src/kimi-provider.ts";

const key = loadKimiKey();
if (!key) { console.error("no key"); process.exit(1); }
console.log("key loaded, head:", key.slice(0, 6) + "...", "default:", DEFAULT_KIMI_MODEL);
console.log("models:", KIMI_MODELS.map(m => m.id).join(", "));

const p = new KimiProvider(key);

console.log("--- thinking enabled (kimi-k2.6) ---");
const r1 = await p.generate(
  [{ role: "user", content: "Reply with exactly: PONG" }],
  { model: "kimi-k2.6", maxTokens: 64 },
);
console.log("text:", JSON.stringify(r1.text));
console.log("tokens:", r1.tokenUsage);

console.log("--- thinking disabled (kimi-k2.6-instant) ---");
const r2 = await p.generate(
  [{ role: "user", content: "Reply with exactly: FAST" }],
  { model: "kimi-k2.6-instant", maxTokens: 16 },
);
console.log("text:", JSON.stringify(r2.text));
console.log("tokens:", r2.tokenUsage);

console.log("--- streaming tokens (kimi-k2.6-instant) ---");
let streamed = "";
const r3 = await p.streamChat(
  [{ role: "user", content: "Count: 1, 2, 3. Then stop." }],
  "kimi-k2.6-instant",
  (tok) => { streamed += tok; process.stdout.write(tok); },
  64,
);
console.log("\ncomplete. total:", streamed.length, "chars,", r3.outputTokens, "out tokens");

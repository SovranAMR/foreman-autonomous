/**
 * Minimal spike: verify @cursor/february Agent.prompt with CURSOR_API_KEY.
 *
 * Usage:
 *   CURSOR_API_KEY=key_... npx tsx scripts/cursor-february-spike.ts
 */
import { Agent } from "@cursor/february/agent";

const apiKey = process.env.CURSOR_API_KEY?.trim();
if (!apiKey) {
  console.error("Set CURSOR_API_KEY (Cursor Dashboard → Cloud Agents / API).");
  process.exit(1);
}

const cwd = process.cwd();
console.log("cwd:", cwd);
console.log("model: composer-2");

try {
  const result = await Agent.prompt(
    "Reply with exactly one line: OK_SPIKE",
    {
      apiKey,
      model: { id: "composer-2" },
      local: { cwd },
    },
  );

  console.log("status:", result.status);
  console.log("result (preview):", (result.result ?? "").slice(0, 500));
  console.log("model:", result.model);
  console.log("durationMs:", result.durationMs);

  if (result.status !== "finished") {
    process.exit(1);
  }
} catch (e: any) {
  console.error("spike failed:", e?.message ?? e);
  process.exit(1);
}

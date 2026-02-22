import { Engine } from "./engine.js";
import { Orchestrator } from "./orchestrator.js";
import { AntigravityProvider, loadCredentials } from "./antigravity-provider.js";
import { basename } from "node:path";

const projectRoot = "/home/sovranamr/projects/foreman";

async function main() {
  console.log("[test] Creating Engine...");
  const engine = new Engine({
    projectRoot,
    projectName: basename(projectRoot),
  });

  // Register provider
  const creds = loadCredentials();
  if (creds) {
    engine.providers.register(new AntigravityProvider(creds));
    console.log("[test] Antigravity provider registered");
  } else {
    console.error("[test] NO CREDENTIALS — run: foreman login");
    process.exit(1);
  }

  console.log("[test] Creating Orchestrator...");
  const orchestrator = new Orchestrator(engine);
  console.log("[test] Orchestrator created OK");

  const events: string[] = [];
  orchestrator.on((event) => {
    events.push(`${event.type}: ${JSON.stringify(event).slice(0, 80)}`);
    console.log(`[event] ${event.type}`);
  });

  console.log("[test] Starting forge run...");
  try {
    const result = await orchestrator.run("Count the number of .ts files in src/ and create a one-line summary in /tmp/forge-test-output.txt");
    console.log("[test] Forge completed!");
    console.log("[test] Events:", events.length);
    console.log("[test] Result:", JSON.stringify(result).slice(0, 300));
  } catch (err) {
    console.error("[test] Forge FAILED:", err);
  }

  await engine.shutdown();
  process.exit(0);
}

main();

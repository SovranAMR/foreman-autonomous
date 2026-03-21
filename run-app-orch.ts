import { Engine } from "./src/engine.js";
import { Orchestrator } from "./src/orchestrator.js";
import { bootstrapProviders } from "./src/provider-bootstrap.js";

async function main() {
  const targetDir = process.argv[2] || process.cwd();
  const task = process.argv[3] || "Fix it";
  const engine = new Engine({ projectRoot: targetDir, projectName: "bebek-isim-app" });
  bootstrapProviders(engine);
  const orchestrator = new Orchestrator(engine);
  try {
    const result = await orchestrator.run(task);
    console.log("Success:", result);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
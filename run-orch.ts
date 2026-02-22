import { Engine } from "./src/engine.js";
import { Orchestrator } from "./src/orchestrator.js";
import { bootstrapProviders } from "./src/provider-bootstrap.js";

async function main() {
  const engine = new Engine({ projectRoot: process.cwd(), projectName: "foreman" });
  bootstrapProviders(engine);
  const orchestrator = new Orchestrator(engine);
  try {
    const result = await orchestrator.run("Write a mock API for tasks in src/mock-api.ts");
    console.log("Success:", result);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
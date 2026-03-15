import { loadCredentials } from "./src/antigravity-provider.js";
import { getSystemPrompt, buildUserPrompt } from "./src/prompts.js";
import { parseForPhase } from "./src/parser.js";

async function main() {
  const creds = loadCredentials();
  if(!creds) { console.log("No creds"); return; }
  
  const testModel = "gemini-3.1-pro-high";
  const { AntigravityProvider } = await import("./src/antigravity-provider.js");
  const provider = new AntigravityProvider(creds);

  try {
     const prompt = buildUserPrompt("hello", "");
     const sysPrompt = getSystemPrompt("visioner", "vision");
     
     const result = await provider.generate(
       [
         { role: "system", content: sysPrompt },
         { role: "user", content: prompt }
       ],
       { model: testModel },
     );
     console.log("Result received:");
     console.log(result.text);

     const parsed = parseForPhase("vision", result.text);
     console.log("Parse Result:", JSON.stringify(parsed, null, 2));

  } catch (e: any) {
     console.error("Provider error:", e.message);
  }
}
main();

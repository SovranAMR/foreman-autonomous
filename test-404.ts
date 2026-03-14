import { loadCredentials, AntigravityProvider, refreshChatModels, CHAT_MODELS } from "./src/antigravity-provider.js";

async function main() {
  const creds = loadCredentials();
  if(!creds) { console.log("No creds"); return; }
  
  const provider = new AntigravityProvider(creds);
  
  console.log("Before refresh, CHAT_MODELS count:", CHAT_MODELS.length);
  await refreshChatModels(creds);
  console.log("After refresh, CHAT_MODELS count:", CHAT_MODELS.length);
  
  const testModel = "gemini-3-flash";

  console.log(`Starting generation with ${testModel}...`);
  try {
     const result = await provider.generate(
       [{ role: "user", content: "hi" }],
       { model: testModel }
     );
     console.log("Result:", result.text);
  } catch (e: any) {
     console.error("Provider error:", e.message);
  }
}
main();

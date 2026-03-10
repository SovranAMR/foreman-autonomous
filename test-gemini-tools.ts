import { AntigravityProvider, loadCredentials } from "./src/antigravity-provider.js";
import { executeTool } from "./src/tools.js";

async function main() {
    const creds = loadCredentials();
    if (!creds) throw new Error("No creds");

    const provider = new AntigravityProvider(creds);

    const messages = [
        { role: "system", content: "You are a helpful assistant. Use your tools." },
        { role: "user", content: "Please run a bash command: echo 'test'" }
    ];

    console.log("Starting stream...");
    try {
        const res = await provider.streamChatWithTools(
            messages,
            "gemini-3.1-pro-high",
            (t) => process.stdout.write(t),
            (tc) => console.log("\nTool Call:", tc),
            (tr) => console.log("\nTool Result:\n", tr.content.slice(0, 50)),
            32000,
            5,
            executeTool
        );
        console.log("\nFinal result:", res);
    } catch (err) {
        console.error("\nERROR:", err);
    }
}

main().catch(console.error);

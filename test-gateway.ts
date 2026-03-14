import { loadConfig } from "./src/setup.js";
import { MessagingGateway } from "./src/messaging-gateway.js";
import { getTelegramToken } from "./src/config.js";

async function main() {
    console.log("Starting script");
    const tgToken = getTelegramToken();
    console.log("tgToken:", !!tgToken);
    
    if (tgToken) {
        console.log("Creating gateway");
        const gateway = new MessagingGateway({
          projectRoot: process.cwd(),
          projectName: "foreman",
          channels: [{
            type: "telegram",
            enabled: true,
            botToken: tgToken,
            allowedSenders: [],
          }],
          maxConcurrent: 5,
          messageTimeoutMs: 120_000,
        });

        console.log("Starting gateway");
        await gateway.start();
        console.log("Gateway started successfully");
    }
    
    console.log("Script finished, waiting to see if event loop stays alive");
    setInterval(() => console.log("tick"), 1000);
}

main().catch(console.error);

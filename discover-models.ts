
import { loadCredentials } from "./src/antigravity-provider.js";

async function run() {
  const creds = loadCredentials();
  if (!creds) {
    console.error("No credentials found. Please run 'foreman login' first.");
    process.exit(1);
  }

  const endpoints = [
    "https://cloudcode-pa.googleapis.com",
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
  ];

  for (const endpoint of endpoints) {
    console.log(`\n--- Fetching models from: ${endpoint} ---`);
    try {
      const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
          "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
        },
        body: JSON.stringify({ project: creds.projectId }),
      });

      if (!response.ok) {
        console.error(`Error ${response.status}: ${await response.text()}`);
        continue;
      }

      const data = await response.json() as any;
      if (data.models) {
        for (const [id, info] of Object.entries(data.models)) {
          const m = info as any;
          console.log(`- ${id} (${m.displayName || 'no name'})`);
        }
      } else {
        console.log("No models returned.");
      }
    } catch (err) {
      console.error("Fetch failed:", err);
    }
  }
}

run();

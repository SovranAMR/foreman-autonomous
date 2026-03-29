/**
 * FOREMAN — Google Antigravity OAuth Provider
 *
 * Access Gemini/Claude/GPT via Google Cloud OAuth.
 * Uses the same Antigravity OAuth flow as OpenClaw:
 *
 * 1. Generate PKCE challenge
 * 2. Start local HTTP server (port 51121)
 * 3. Open Google OAuth page in browser
 * 4. Receive code from callback → token exchange
 * 5. Project discovery (cloudcode-pa API)
 * 6. Use access_token + projectId for Vertex AI requests
 *
 * Token format: JSON.stringify({ token, projectId })
 */

import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { brand, icon } from "./theme.js";

// ─── OAUTH CREDENTIALS ──────────────────────────────────────
// Gemini CLI OAuth credentials — env var'lardan okunur
// Kurulum: ~/.foreman/config.json veya env var olarak ayarla
// ANTIGRAVITY_CLIENT_ID ve ANTIGRAVITY_CLIENT_SECRET gerekli

const CLIENT_ID = process.env.ANTIGRAVITY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ANTIGRAVITY_CLIENT_SECRET || '';
const REDIRECT_URI = "http://localhost:51121/oauth-callback";
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

// ─── TYPES ───────────────────────────────────────────────────

export interface AntigravityCredentials {
  accessToken: string;
  refreshToken: string;
  projectId: string;
  email?: string;
  expiresAt: number; // ms timestamp
}

// ─── PKCE ────────────────────────────────────────────────────

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ─── LOCAL CALLBACK SERVER ───────────────────────────────────

interface CallbackResult {
  code: string;
  state: string;
}

function startCallbackServer(): Promise<{
  server: Server;
  waitForCode: () => Promise<CallbackResult | null>;
}> {
  return new Promise((resolve, reject) => {
    let result: CallbackResult | null = null;
    let done = false;

    const server = createServer((req, res) => {
      const url = new URL(req.url || "", `http://localhost:51121`);
      if (url.pathname === "/oauth-callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>⚒ Authentication Failed</h1><p>Error: ${error}</p><p>You can close this window.</p></body></html>`);
          return;
        }

        if (code && state) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<html><body style="background:#1a1a1a;color:#f5a623;font-family:monospace;text-align:center;padding:60px">
            <h1>⚔️ FOREMAN — Authenticated!</h1>
            <p style="color:#22c55e">The forge has your credentials. Return to the terminal.</p>
            <p style="color:#6b7280">You can close this window.</p>
          </body></html>`);
          result = { code, state };
          done = true;
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>Missing parameters</h1></body></html>`);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.on("error", reject);

    server.listen(51121, "127.0.0.1", () => {
      resolve({
        server,
        waitForCode: async () => {
          while (!done) {
            await new Promise(r => setTimeout(r, 100));
          }
          return result;
        },
      });
    });
  });
}

// ─── PROJECT DISCOVERY ───────────────────────────────────────

async function discoverProject(accessToken: string): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "foreman-cli/0.1.0",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": JSON.stringify({
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    }),
  };

  const endpoints = [
    "https://cloudcode-pa.googleapis.com",
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
      });

      if (response.ok) {
        const data = await response.json() as Record<string, unknown>;
        if (typeof data.cloudaicompanionProject === "string" && data.cloudaicompanionProject) {
          return data.cloudaicompanionProject;
        }
        const proj = data.cloudaicompanionProject as Record<string, unknown> | undefined;
        if (proj?.id) {
          return proj.id as string;
        }
      }
    } catch {
      // try next
    }
  }

  return DEFAULT_PROJECT_ID;
}

// ─── USER EMAIL ──────────────────────────────────────────────

async function getUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = await response.json() as Record<string, unknown>;
      return data.email as string | undefined;
    }
  } catch { /* ignore */ }
  return undefined;
}

// ─── TOKEN REFRESH ───────────────────────────────────────────

export async function refreshAntigravityToken(
  refreshToken: string,
  projectId: string,
): Promise<AntigravityCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json() as Record<string, unknown>;

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) || refreshToken,
    projectId,
    expiresAt: Date.now() + (data.expires_in as number) * 1000 - 5 * 60 * 1000,
  };
}

// ─── FULL LOGIN FLOW ─────────────────────────────────────────

/**
 * Antigravity OAuth login — opens browser for Google sign-in.
 *
 * Called from Foreman CLI:
 * ```
 * const creds = await loginAntigravity();
 * // use creds.accessToken, creds.projectId with Vertex AI
 * ```
 */
export async function loginAntigravity(): Promise<AntigravityCredentials> {
  const { verifier, challenge } = await generatePKCE();

  console.log(`\n    ${icon.anvil} ${brand.gold("Antigravity OAuth — Sign in with Google Cloud")}`);
  console.log(`    ${brand.dim("─".repeat(50))}`);

  // Start callback server
  console.log(`    ${brand.dim("Starting local callback server...")}`);
  const { server, waitForCode } = await startCallbackServer();

  try {
    // Build auth URL
    const authParams = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: verifier,
      access_type: "offline",
      prompt: "consent",
    });

    const authUrl = `${AUTH_URL}?${authParams.toString()}`;

    // Open browser
    console.log("");
    console.log(`    ${brand.gold("⚒")} ${brand.bold("Sign in with Google in your browser:")}`);
    console.log("");
    console.log(`    ${brand.cyan(authUrl)}`);
    console.log("");

    // Try to open browser automatically
    try {
      const { exec } = await import("node:child_process");
      const openCmd = process.platform === "darwin"
        ? `open "${authUrl}"`
        : process.platform === "win32"
          ? `start "${authUrl}"`
          : `xdg-open "${authUrl}"`;
      exec(openCmd);
      console.log(`    ${icon.done} ${brand.dim("Browser opened. Waiting for sign-in...")}`);
    } catch {
      console.log(`    ${brand.dim("Open the URL above in your browser.")}`);
    }

    // Wait for callback
    const result = await waitForCode();

    if (!result || !result.code) {
      throw new Error("Could not receive code from OAuth callback");
    }

    // Verify state
    if (result.state !== verifier) {
      throw new Error("OAuth state mismatch — possible CSRF attack");
    }

    // Exchange code for tokens
    console.log(`    ${brand.dim("Exchanging token...")}`);

    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: result.code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = await tokenResponse.json() as Record<string, unknown>;

    if (!tokenData.refresh_token) {
      throw new Error("Could not obtain refresh token. Please try again.");
    }

    // Get email
    console.log(`    ${brand.dim("Fetching user info...")}`);
    const email = await getUserEmail(tokenData.access_token as string);

    // Discover project
    console.log(`    ${brand.dim("Discovering project...")}`);
    const projectId = await discoverProject(tokenData.access_token as string);

    const expiresAt = Date.now() + (tokenData.expires_in as number) * 1000 - 5 * 60 * 1000;

    console.log("");
    console.log(`    ${icon.done} ${brand.green("Authentication successful!")}`);
    if (email) console.log(`    ${brand.dim("Email:")} ${email}`);
    console.log(`    ${brand.dim("Project:")} ${projectId}`);
    console.log(`    ${brand.dim("Token:")} ${(tokenData.access_token as string).slice(0, 20)}...`);
    console.log(`    ${brand.dim("Expires:")} ${new Date(expiresAt).toLocaleString()}`);
    console.log("");

    return {
      accessToken: tokenData.access_token as string,
      refreshToken: tokenData.refresh_token as string,
      projectId,
      email,
      expiresAt,
    };
  } finally {
    server.close();
  }
}

/**
 * FOREMAN — Web Server
 *
 * HTTP + WebSocket server for the Foreman Web UI.
 * Serves static files from web/ and handles chat + forge via WebSocket.
 *
 * Usage: npx tsx src/web-server.ts
 *        foreman web
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import {
    AntigravityProvider,
    loadCredentials,
    CHAT_MODELS,
    DEFAULT_CHAT_MODEL,
} from "./antigravity-provider.js";
import {
    KimiProvider,
    loadKimiKey,
    DEFAULT_KIMI_MODEL,
} from "./kimi-provider.js";
import type { ToolCall, ToolResult } from "./tools.js";
import { createToolExecutor } from "./tools.js";

import { Engine } from "./engine.js";
import { Orchestrator, type OrchestratorEvent } from "./orchestrator.js";
import { CallbackTarget, type StreamEvent } from "./streaming-pipeline.js";

// ─── TYPES ──────────────────────────────────────────────────

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface WSClient {
    socket: import("node:net").Socket;
    send: (data: unknown) => void;
    id: string;
}

// ─── CONFIG ─────────────────────────────────────────────────

const PORT = parseInt(process.env.FOREMAN_WEB_PORT ?? "4567", 10);
const CWD = process.cwd();
const WEB_DIR = join(import.meta.dirname ?? CWD, "..", "web");

// ─── MIME TYPES ─────────────────────────────────────────────

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
};

// ─── STATE ──────────────────────────────────────────────────

const clients: WSClient[] = [];
const chatHistory: ChatMessage[] = [];
let provider: AntigravityProvider | KimiProvider | null = null;
let engine: Engine | null = null;
let model = DEFAULT_CHAT_MODEL;
let forgeRunning = false;

// ─── PROJECT DETECTION ──────────────────────────────────────

function detectProject(): { name: string; info: string; fileTree: string } {
    let name = basename(CWD);
    const infoParts: string[] = [];
    const files: string[] = [];

    const pkgPath = join(CWD, "package.json");
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
            if (pkg.name) name = pkg.name;
            if (pkg.description) infoParts.push(`Description: ${pkg.description}`);
            if (pkg.version) infoParts.push(`Version: ${pkg.version}`);
        } catch { /* ignore */ }
    }

    try {
        const entries = readdirSync(CWD, { withFileTypes: true });
        for (const entry of entries.slice(0, 30)) {
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            files.push(`  ${entry.name}${entry.isDirectory() ? "/" : ""}`);
        }
    } catch { /* ignore */ }

    return { name, info: infoParts.join("\n") || `Dir: ${CWD}`, fileTree: files.join("\n") };
}

function buildSystemPrompt(proj: { name: string; info: string; fileTree: string }): string {
    return `You are Foreman — an AI coding assistant with full filesystem and shell access.

TOOLS AVAILABLE:
- bash: Run shell commands
- read_file: Read file contents (supports line ranges)
- write_file: Create or overwrite files
- edit_file: Make targeted replacements in files
- search_files: Find files by name/glob
- grep: Search file contents
- list_dir: List directory contents

WORKFLOW:
1. UNDERSTAND — Read relevant files first
2. PLAN — Think about minimal changes needed
3. EXECUTE — Use tools to make changes
4. VERIFY — Run builds/tests when possible

Working directory: ${CWD}
Project: ${proj.name}
${proj.info}

Files:\n${proj.fileTree}`;
}

// ─── WEBSOCKET HELPERS ──────────────────────────────────────

function encodeWSFrame(data: string): Buffer {
    const payload = Buffer.from(data, "utf-8");
    const len = payload.length;
    let header: Buffer;

    if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; // FIN + text
        header[1] = len;
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }

    return Buffer.concat([header, payload]);
}

function decodeWSFrame(data: Buffer): string | null {
    if (data.length < 2) return null;
    const masked = !!(data[1]! & 0x80);
    let payloadLen = data[1]! & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
        payloadLen = data.readUInt16BE(2);
        offset = 4;
    } else if (payloadLen === 127) {
        payloadLen = Number(data.readBigUInt64BE(2));
        offset = 10;
    }

    let maskKey: Buffer | null = null;
    if (masked) {
        maskKey = data.subarray(offset, offset + 4);
        offset += 4;
    }

    const payload = data.subarray(offset, offset + payloadLen);
    if (maskKey) {
        for (let i = 0; i < payload.length; i++) {
            payload[i] = payload[i]! ^ maskKey[i % 4]!;
        }
    }

    return payload.toString("utf-8");
}

function broadcast(data: unknown): void {
    const json = JSON.stringify(data);
    const frame = encodeWSFrame(json);
    for (const client of clients) {
        try { client.socket.write(frame); } catch { /* ignore dead sockets */ }
    }
}

// ─── INIT LLM PROVIDER ─────────────────────────────────────

async function initProvider(): Promise<void> {
    // Try Antigravity first
    const creds = loadCredentials();
    if (creds) {
        provider = new AntigravityProvider(creds);
        console.log("  ✓ Antigravity provider loaded");
        return;
    }

    // Try Kimi
    const kimiKey = loadKimiKey();
    if (kimiKey) {
        provider = new KimiProvider(kimiKey);
        model = DEFAULT_KIMI_MODEL;
        console.log("  ✓ Kimi provider loaded");
        return;
    }

    console.log("  ⚠ No LLM provider found — run `foreman login` first");
}

async function initEngine(): Promise<void> {
    try {
        const proj = detectProject();
        engine = new Engine({
            projectRoot: CWD,
            projectName: proj.name,
            model: model,
        });
        console.log("  ✓ Engine initialized");
    } catch (err) {
        console.log(`  ⚠ Engine init failed: ${err}`);
    }
}

// ─── CHAT HANDLER ───────────────────────────────────────────

async function handleChat(message: string): Promise<void> {
    if (!provider) {
        broadcast({ type: "error", message: "No LLM provider. Run `foreman login` first." });
        return;
    }

    const proj = detectProject();
    if (chatHistory.length === 0) {
        chatHistory.push({ role: "system", content: buildSystemPrompt(proj) });
    }

    chatHistory.push({ role: "user", content: message });

    const toolExecutor = createToolExecutor(CWD);

    try {
        let responseText = "";

        await provider.streamChatWithTools(
            chatHistory,
            model,
            // Token callback
            (token: string) => {
                responseText += token;
                broadcast({ type: "token", text: token });
            },
            // Tool call callback
            (call: ToolCall) => {
                broadcast({
                    type: "event", event: {
                        type: "tool_call",
                        timestamp: Date.now(),
                        detail: `🔧 ${call.name}(${JSON.stringify(call.args).slice(0, 100)})`,
                    }
                });
            },
            // Tool result callback
            (result: ToolResult) => {
                broadcast({
                    type: "event", event: {
                        type: "tool_result",
                        timestamp: Date.now(),
                        detail: `${result.isError ? "✖" : "✔"} ${result.name}: ${result.content.slice(0, 100)}`,
                    }
                });
            },
            32768,  // maxTokens
            25,     // maxIterations
            toolExecutor,
        );

        chatHistory.push({ role: "assistant", content: responseText });
        broadcast({ type: "stream_end" });
    } catch (err: any) {
        broadcast({ type: "error", message: err.message ?? String(err) });
        broadcast({ type: "stream_end" });
    }
}

// ─── FORGE HANDLER ──────────────────────────────────────────

async function handleForge(task: string): Promise<void> {
    if (forgeRunning) {
        broadcast({ type: "error", message: "A forge pipeline is already running." });
        return;
    }

    if (!engine) {
        await initEngine();
    }

    if (!engine) {
        broadcast({ type: "error", message: "Engine not available. Check configuration." });
        return;
    }

    forgeRunning = true;

    try {
        const orchestrator = new Orchestrator(engine);

        // Hook into streaming pipeline
        if (engine.streaming) {
            engine.streaming.addTarget(new CallbackTarget((event: StreamEvent) => {
                broadcast({ type: "event", event });
                broadcast({ type: "progress", progress: engine!.streaming.getProgress() });
            }));
        }

        // Listen to orchestrator events for phase tracking
        orchestrator.on((event: OrchestratorEvent) => {
            const mapped = mapOrchestratorEvent(event);
            if (mapped) {
                broadcast({ type: "event", event: mapped });
            }
        });

        const result = await orchestrator.run(task);

        broadcast({
            type: "event", event: {
                type: "pipeline_end",
                timestamp: Date.now(),
                detail: result.success
                    ? `✔ Pipeline complete — ${result.totalThoughts} thoughts, ${result.totalTokens} tokens`
                    : `✖ Pipeline failed at ${result.blockedAt ?? "unknown"}`,
            }
        });

    } catch (err: any) {
        broadcast({
            type: "event", event: {
                type: "pipeline_end",
                timestamp: Date.now(),
                detail: `✖ Error: ${err.message ?? String(err)}`,
            }
        });
    } finally {
        forgeRunning = false;
        broadcast({ type: "stream_end" });
    }
}

function mapOrchestratorEvent(event: OrchestratorEvent): StreamEvent | null {
    switch (event.type) {
        case "phase_start":
            return { type: "phase_start", timestamp: Date.now(), phase: event.phase, detail: event.detail };
        case "phase_end":
            return { type: "phase_end", timestamp: Date.now(), phase: event.phase, detail: event.detail };
        case "block_detected":
            return { type: "block_start", timestamp: Date.now(), detail: event.reason };
        case "thought_complete":
            return { type: "atom_end", timestamp: Date.now(), detail: event.thought?.output?.slice(0, 80) ?? "done" };
        case "error":
            return { type: "error", timestamp: Date.now(), detail: event.message };
        case "pipeline_complete":
            return null; // Handled separately
        default:
            return null;
    }
}

// ─── HTTP SERVER ────────────────────────────────────────────

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    const path = url === "/" ? "/index.html" : url.split("?")[0]!;

    // Serve static files from web/
    const filePath = join(WEB_DIR, path);
    if (!filePath.startsWith(WEB_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not Found");
        return;
    }

    try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        const contentType = MIME[ext] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
    } catch {
        res.writeHead(500);
        res.end("Internal Server Error");
    }
});

// ─── WEBSOCKET UPGRADE ──────────────────────────────────────

server.on("upgrade", (req, socket: any) => {
    if (req.url !== "/ws") {
        socket.destroy();
        return;
    }

    // WebSocket handshake
    const key = req.headers["sec-websocket-key"];
    if (!key) { socket.destroy(); return; }

    const acceptKey = createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-5AB5DC11CE46")
        .digest("base64");

    socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        "\r\n"
    );

    const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const client: WSClient = {
        socket,
        id: clientId,
        send: (data: unknown) => {
            try { socket.write(encodeWSFrame(JSON.stringify(data))); } catch { /* dead socket */ }
        },
    };

    clients.push(client);
    console.log(`  ⚡ Client connected: ${clientId}`);

    // Send project info
    const proj = detectProject();
    client.send({ type: "project", name: proj.name, path: CWD });

    // Handle incoming messages
    let buffer = Buffer.alloc(0);

    socket.on("data", (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);

        // Try to decode (simple single-frame handling)
        const text = decodeWSFrame(buffer);
        if (text !== null) {
            buffer = Buffer.alloc(0);
            try {
                const msg = JSON.parse(text);
                if (msg.type === "chat" && msg.message) {
                    handleChat(msg.message);
                } else if (msg.type === "forge" && msg.task) {
                    handleForge(msg.task);
                }
            } catch { /* ignore parse errors */ }
        }
    });

    socket.on("close", () => {
        const idx = clients.indexOf(client);
        if (idx >= 0) clients.splice(idx, 1);
        console.log(`  ○ Client disconnected: ${clientId}`);
    });

    socket.on("error", () => {
        const idx = clients.indexOf(client);
        if (idx >= 0) clients.splice(idx, 1);
    });
});

// ─── START ──────────────────────────────────────────────────

async function main() {
    console.log("");
    console.log("  ⚒️  FOREMAN Web UI");
    console.log("  ─────────────────────");

    await initProvider();

    server.listen(PORT, () => {
        console.log("");
        console.log(`  🌐 http://localhost:${PORT}`);
        console.log(`  📡 WebSocket: ws://localhost:${PORT}/ws`);
        console.log("");
        console.log("  Ready. Open the URL in your browser.");
        console.log("");
    });
}

main().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});

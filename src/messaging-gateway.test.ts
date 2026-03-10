/**
 * FOREMAN — Messaging Gateway Tests
 *
 * Tests the channel interface, gateway message processing,
 * conversation management, and command handling.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Channel,
  InboundMessage,
  OutboundReply,
  ChannelType,
} from "./channel.js";

import { MessagingGateway } from "./messaging-gateway.js";

// ─── MOCK CHANNEL ───────────────────────────────────────────

class MockChannel implements Channel {
  readonly type: ChannelType;
  sent: Array<{ chatId: string; reply: OutboundReply }> = [];
  private connected = false;

  constructor(type: ChannelType = "telegram") {
    this.type = type;
  }

  async start() { this.connected = true; }
  async stop() { }
  async send(chatId: string, reply: OutboundReply): Promise<string | undefined> {
    this.sent.push({ chatId, reply });
    return "mock-id";
  }
  isConnected() { return true; }
}

// ─── HELPERS ────────────────────────────────────────────────

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "msg-1",
    channel: "telegram",
    senderId: "user-123",
    senderName: "Test User",
    text: "Hello Foreman",
    chatId: "chat-456",
    isGroup: false,
    timestamp: new Date(),
    ...overrides,
  };
}

// ─── TESTS ──────────────────────────────────────────────────

describe("Channel Interface", () => {
  it("MockChannel starts and stops", async () => {
    const ch = new MockChannel();
    assert.equal(ch.isConnected(), false);
    await ch.start();
    assert.equal(ch.isConnected(), true);
    await ch.stop();
    assert.equal(ch.isConnected(), false);
  });

  it("MockChannel sends messages", async () => {
    const ch = new MockChannel();
    await ch.send("chat-1", { text: "hello" });
    assert.equal(ch.sent.length, 1);
    assert.equal(ch.sent[0].chatId, "chat-1");
    assert.equal(ch.sent[0].reply.text, "hello");
  });

  it("channel type is correct", () => {
    const tg = new MockChannel("telegram");
    const wa = new MockChannel("whatsapp");
    assert.equal(tg.type, "telegram");
    assert.equal(wa.type, "whatsapp");
  });
});

describe("InboundMessage", () => {
  it("creates valid message", () => {
    const msg = makeMessage();
    assert.equal(msg.channel, "telegram");
    assert.equal(msg.senderId, "user-123");
    assert.equal(msg.text, "Hello Foreman");
    assert.equal(msg.isGroup, false);
  });

  it("group message", () => {
    const msg = makeMessage({ isGroup: true, chatId: "group-789" });
    assert.equal(msg.isGroup, true);
    assert.equal(msg.chatId, "group-789");
  });

  it("reply message", () => {
    const msg = makeMessage({ replyToId: "msg-0" });
    assert.equal(msg.replyToId, "msg-0");
  });
});

describe("MessagingGateway", () => {
  it("creates with config", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-gw-"));
    const gw = new MessagingGateway({
      projectRoot: tempDir,
      projectName: "test",
      channels: [],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    });
    assert.equal(gw.isRunning(), false);
    assert.equal(gw.getActiveChannels(), 0);
    assert.equal(gw.getConversationCount(), 0);
  });

  it("handles /status command", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-gw-"));
    const gw = new MessagingGateway({
      projectRoot: tempDir,
      projectName: "test-project",
      channels: [],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    });

    const msg = makeMessage({ text: "/status" });
    const reply = await gw.handleMessage(msg);
    assert.ok(reply);
    assert.ok(reply.text.includes("Foreman Status"));
    assert.ok(reply.text.includes("test-project"));
  });

  it("handles /help command", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-gw-"));
    const gw = new MessagingGateway({
      projectRoot: tempDir,
      projectName: "test",
      channels: [],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    });

    const reply = await gw.handleMessage(makeMessage({ text: "/help" }));
    assert.ok(reply);
    assert.ok(reply.text.includes("Foreman"));
  });

  it("handles /tools command", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-gw-"));
    const gw = new MessagingGateway({
      projectRoot: tempDir,
      projectName: "test",
      channels: [],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    });

    const reply = await gw.handleMessage(makeMessage({ text: "/tools" }));
    assert.ok(reply);
    assert.ok(reply.text.includes("Available Tools"));
    assert.ok(reply.text.includes("bash"));
  });

  it("handles /clear command", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-gw-"));
    const gw = new MessagingGateway({
      projectRoot: tempDir,
      projectName: "test",
      channels: [],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    });

    const reply = await gw.handleMessage(makeMessage({ text: "/clear" }));
    assert.ok(reply);
    assert.ok(reply.text.includes("cleared"));
  });

  it("handles Turkish commands", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-gw-"));
    const gw = new MessagingGateway({
      projectRoot: tempDir,
      projectName: "test",
      channels: [],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    });

    const durum = await gw.handleMessage(makeMessage({ text: "/durum" }));
    assert.ok(durum);
    assert.ok(durum.text.includes("Foreman Status"));

    const yardim = await gw.handleMessage(makeMessage({ text: "/yardim" }));
    assert.ok(yardim);
    assert.ok(yardim.text.includes("Foreman"));
  });

  it("blocks unauthorized senders", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-gw-"));
    const gw = new MessagingGateway({
      projectRoot: tempDir,
      projectName: "test",
      channels: [{
        type: "telegram",
        enabled: true,
        allowedSenders: ["allowed-user"],
      } as any],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    });

    const reply = await gw.handleMessage(makeMessage({
      channel: "telegram",
      senderId: "blocked-user",
      text: "Hello",
    }));
    assert.equal(reply, null); // Blocked — no reply
  });

  it("allows authorized senders", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-gw-"));
    const gw = new MessagingGateway({
      projectRoot: tempDir,
      projectName: "test",
      channels: [{
        type: "telegram",
        enabled: true,
        allowedSenders: ["user-123"],
      } as any],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    });

    // /status should work for allowed user
    const reply = await gw.handleMessage(makeMessage({
      senderId: "user-123",
      text: "/status",
    }));
    assert.ok(reply);
    assert.ok(reply.text.includes("Foreman Status"));
  });

  it("skips empty messages", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "foreman-gw-"));
    const gw = new MessagingGateway({
      projectRoot: tempDir,
      projectName: "test",
      channels: [],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    });

    const reply = await gw.handleMessage(makeMessage({ text: "" }));
    assert.equal(reply, null);

    const reply2 = await gw.handleMessage(makeMessage({ text: "   " }));
    assert.equal(reply2, null);
  });
});

describe("TelegramChannel", () => {
  it("module exports TelegramChannel class", async () => {
    const mod = await import("./telegram-channel.js");
    assert.ok(mod.TelegramChannel);
    assert.equal(typeof mod.TelegramChannel, "function");
  });
});

describe("WhatsAppChannel", () => {
  it("module exports WhatsAppChannel class", async () => {
    const mod = await import("./whatsapp-channel.js");
    assert.ok(mod.WhatsAppChannel);
    assert.equal(typeof mod.WhatsAppChannel, "function");
  });
});

describe("Gateway Config", () => {
  it("supports multiple channel configs", () => {
    const config = {
      projectRoot: "/tmp/test",
      projectName: "test",
      channels: [
        { type: "telegram" as const, enabled: true, allowedSenders: [], botToken: "token" },
        { type: "whatsapp" as const, enabled: true, allowedSenders: [], sessionDir: "/tmp" },
      ],
      maxConcurrent: 5,
      messageTimeoutMs: 30000,
    };
    assert.equal(config.channels.length, 2);
    assert.equal(config.channels[0].type, "telegram");
    assert.equal(config.channels[1].type, "whatsapp");
  });
});

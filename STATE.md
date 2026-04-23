# FOREMAN BUILD STATE

> Bu dosyayı her session başında oku. Foreman'ın anlık durumunu gösterir.

## Mevcut Durum: PRODUCTION-READY ✅

Foreman tam pipeline + Telegram bot olarak çalışıyor.

```bash
foreman init "proje" && foreman run "görev"       # CLI pipeline
foreman serve --telegram '<token>' --allow <id>    # Telegram bot
foreman repl                                       # Interactive REPL
```

## Stats

| Metrik | Değer |
|--------|-------|
| Source Files | 126 `.ts` |
| Total LOC | ~49,000 |
| Tests | 636+ (0 fail) |
| Test Files | 38 |
| LLM Tools | 48 |
| CLI Commands | 47 |
| REPL Commands | 16 |
| Engines | 40 (32 wired in orchestrator) |
| Git Commits | 248+ |
| Providers | 5 (Kimi, Antigravity, Anthropic, OpenAI, Gemini) |

## Fazlar

| Faz | Durum | Açıklama |
|-----|-------|----------|
| Faz 0: Temel İnşa | ✅ | Tip sistemi, state machine, persistence, rate limiter, engine, CLI |
| Faz 1: LLM Provider | ✅ | 5 provider (Kimi, Antigravity, Anthropic, OpenAI, Gemini) |
| Faz 1.5: Orkestratör | ✅ | 4-layer pipeline (vision→decompose→research→execute→review) |
| Faz 1.7: UI + Installer | ✅ | Theme, gradient logo, setup wizard |
| Faz 2: Gerçek LLM Test | ✅ | Forge pipeline E2E verified |
| Faz 3: Research Engine | ✅ | Brave Search, web fetch, SSRF protection, cache |
| Faz 4: Execution Engine | ✅ | Async spawn, security scanner, approval engine |
| Faz 5: Context & Memory | ✅ | Compression, embedding, multi-session, TF-IDF |
| Faz 6: Messaging Gateway | ✅ | Telegram bot + WhatsApp channel |
| Faz 7: Deep Audit | ✅ | Type safety, security hardening, dead code cleanup |

## Aktif Konfigürasyon

- **Primary Model**: `kimi-k2.6` (Moonshot AI, 256K context, thinking mode)
- **Secondary**: `kimi-k2.6-instant` (thinking disabled — fast path)
- **Fallback**: `kimi-k2.5` → `composer-2` → `gemini-3.1-pro-high` → Claude/GPT chain
- **Default Layer Config**: Kimi-first (visioner/strategist/researcher/worker all start with kimi-k2.6)
- **Provider Priority**: Kimi → Antigravity → Anthropic → OpenAI → Gemini → Cursor
- **Bot**: `@Foreman_DasBot` on Telegram
- **Rate Limit**: 6s between calls, 10/min max

### Kimi K2.6 Kısıtları (Moonshot official)
- Endpoint: `https://api.moonshot.ai/v1`
- Sabit parametreler (başka değer → 400 error):
  - `temperature`: 1.0 (thinking) / 0.6 (instant)
  - `top_p=0.95`, `n=1`, `presence_penalty=0`, `frequency_penalty=0`
- `thinking: {type: "enabled"|"disabled"}` parametresi (default enabled)
- Thinking + tools: `tool_choice` sadece `"auto"` veya `"none"`
- Multi-step tool calling'te `reasoning_content` context'te korunmalı
- Context window: 262,144 token (256K)

## Son Audit Sonuçları (2026-02-24)

- `as any` casts: 93 → 4 (remaining: WhatsApp SDK compat only)
- Dead code: 0 (after cleanup)
- State files in git: 0 (all gitignored)
- Unhandled promise rejections: 0 (all fixed)
- Timer leaks: 0 (cleanup timer properly cleared)
- Security: null byte protection, expanded command blocklist, SSH key denial
- Empty response guards: vision + callLLM
- Message queue: concurrent messages queued instead of dropped
- Conversation trimming: message count + character budget (100K)

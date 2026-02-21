# FOREMAN BUILD STATE

> Bu dosyayı her session başında oku. Foreman'ın anlık durumunu gösterir.

## Mevcut Durum: MVP TAMAMLANDI ✅

Foreman CLI'dan tam pipeline çalıştırabiliyor:
```bash
foreman init "proje" && foreman run "görev" --mock
```

## Fazlar

| Faz | Durum | Açıklama |
|-----|-------|----------|
| Faz 0: Temel İnşa | ✅ | Tip sistemi, state machine, persistence, rate limiter, engine, CLI |
| Faz 1: LLM Provider | ✅ | Anthropic + OpenAI SDK entegrasyonu |
| Faz 1.5: Orkestratör | ✅ | Tam pipeline (vision→execute→reflect), event system |
| Faz 1.7: UI + Installer | ✅ | Theme, gradient logo, setup wizard, install.sh |
| Faz 2: Gerçek LLM Test | ⏳ | API key ayarla, gerçek görevle test et |
| Faz 3: Research Engine | ✅ | OpenClaw transplant: Brave Search API, web fetch (Readability + HTML→MD), SSRF koruması, cache |
| Faz 4: Execution Engine | ✅ | OpenClaw transplant: async spawn (timeout/kill), line-range read, smart truncation, detailed git ops |
| Faz 5: Context & Memory | ⏳ | Context compression, cross-session memory |

## Tamamlanan Chain'ler

| # | Chain | Test | LOC | Açıklama |
|---|-------|------|-----|----------|
| 1 | chain_001: Type System | — | 603 | Tüm core tipler (10 thought) |
| 2 | chain_002: State Machine | 14 | ~200 | StateManager, auto-persist, error types |
| 3 | chain_003: Persistence | 25 | ~300 | ThoughtManager, ChainManager, Validators |
| 4 | chain_004: Rate Limiter | 12 | ~250 | Throttle, model rotation, token budget |
| 5 | chain_005: Engine | 10 | ~300 | LLMProvider, prompts, Engine core |
| 6 | chain_006: CLI | manual | ~280 | Commander.js, 9 komut |
| 7 | chain_007: LLM Providers | — | ~300 | Anthropic + OpenAI SDK |
| 8 | chain_008: Orchestrator | 5 | ~250 | Full pipeline, event system, reflection |

## Metrikler

- **Toplam chain**: 8
- **Toplam test**: 282 (0 fail)
- **Toplam kaynak dosya**: 20+ (.ts)
- **Toplam LOC**: ~5000+
- **Git commits**: 19+
- **GitHub**: https://github.com/SovranAMR/foreman

## Dosya → Sorumluluk Haritası

| Dosya | Ne yapar | Bağımlılıkları |
|-------|----------|----------------|
| `types.ts` | Tüm tipler, VALID_TRANSITIONS | — |
| `state.ts` | State machine, persist | types |
| `thought-manager.ts` | Thought CRUD, auto-ID | types |
| `chain-manager.ts` | Chain CRUD, addThought | types |
| `validators.ts` | Thought completion kontrol | types |
| `rate-limiter.ts` | Throttle, rotation, budget | types |
| `provider.ts` | LLMProvider interface, Mock, Registry | types |
| `anthropic-provider.ts` | Anthropic SDK wrapper | provider |
| `openai-provider.ts` | OpenAI SDK wrapper | provider |
| `prompts.ts` | 4 katman system prompt | types |
| `engine.ts` | think(), step(), parsing | state, thought-manager, chain-manager, rate-limiter, provider, prompts, validators |
| `orchestrator.ts` | run() pipeline, events | engine |
| `setup.ts` | API key wizard | theme, anthropic-provider, openai-provider |
| `theme.ts` | Renkler, ikonlar, box'lar | chalk, gradient-string, figures |
| `execution-engine.ts` | File ops, shell (sync+async), git, process mgmt | — |
| `research-engine.ts` | File search, npm info, web research | web-search-engine, web-fetch-engine |
| `web-search-engine.ts` | Brave Search API | web-shared |
| `web-fetch-engine.ts` | URL fetch, SSRF protection, HTML→MD | web-shared, web-fetch-utils |
| `web-fetch-utils.ts` | HTML→Markdown, text extraction | — |
| `web-shared.ts` | Cache, timeout, response utils | — |
| `tools.ts` | LLM function calling tool definitions | execution-engine |

## Bağımlılıklar

### Runtime
- `@anthropic-ai/sdk` — Anthropic API
- `openai` — OpenAI API
- `commander` — CLI framework
- `chalk` — Terminal renkleri
- `gradient-string` — Gradient text
- `figures` — Unicode ikonlar
- `boxen` — Terminal kutuları
- `ora` — Spinner (henüz kullanılmıyor, reserved)

### Dev
- `tsx` — TypeScript executor
- `typescript` — Type checking

## Sonraki Adımlar (Öncelik Sırasıyla)

1. **Gerçek LLM testi**: API key'leri ayarla, gerçek görev üzerinde test et
2. **BLOK 3: Git Integration**: Atomik commit per thought, branch mgmt, diff analysis
3. **BLOK 5: Memory Deepening**: Embedding-based similarity, MEMORY.md format
4. **BLOK 6: Context & Session**: Sliding window context, session transcript→summary
5. **BLOK 4: Browser & Visual**: Puppeteer/Playwright, screenshot verification (son)

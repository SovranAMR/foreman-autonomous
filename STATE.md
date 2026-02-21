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
| Faz 3: Research Engine | ⏳ | Web search, dosya araştırma |
| Faz 4: Execution Engine | ⏳ | Dosya okuma/yazma, build/test, git commit |
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
- **Toplam test**: 66 (0 fail)
- **Toplam kaynak dosya**: 16 (.ts)
- **Toplam LOC**: ~2500+
- **Git commits**: 15 (aed7da4 → bbb7595)
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
| `cli.ts` | CLI entry point | engine, orchestrator, setup, theme, providers |

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

1. **Gerçek LLM testi**: API key'leri ayarla, Eyricediş hero üzerinde test et
2. **Web araştırma motoru**: Brave/Google search → researcher katmanına entegre
3. **Dosya okuma/yazma**: Worker'ın gerçek dosya oluşturması/düzenlemesi
4. **Build/test runner**: `npm run build`, test çalıştırma
5. **Git commit integration**: Her atom sonrası otomatik commit
6. **Context compression**: Uzun zincirlerin özetlenmesi
7. **Screenshot verification**: Puppeteer ile görsel doğrulama

# Foreman — Agent & Developer Guidelines

## Repo
- **GitHub**: https://github.com/SovranAMR/foreman (private)
- **Local**: `/home/sovranamr/projects/foreman/`
- **Owner**: Ali İlçel (@SovranAMR)

## İlk Okunan Dosyalar (sırayla)
1. `STATE.md` — Anlık build durumu, ne tamamlandı ne kaldı
2. `VISION.md` — Ürün vizyonu, problem tanımı, ilkeler
3. `ARCHITECTURE.md` — Teknik mimari, tüm interface'ler, state machine
4. `AGENTS.md` — Bu dosya

---

## Mimari — 4 Katman

Foreman, AI agent'ları 4 katmanlı düşünce zinciriyle orkestre eder. Her katmanın tek bir sorusu var:

### 🔮 Vizyoner (Visioner)
- **Sorusu**: "Bu NEDEN var?"
- **Rolü**: Ruh, yön, estetik karar. Projenin hissiyatını belirler.
- **Model**: `kimi-k2.5` (primary), `gemini-3.1-pro-high` (fallback)
- **Kurallar**: Araştırma zorunlu, doğrulama zorunlu, BLOCK gönderemez (en üst katman)
- **Max thought/chain**: 50
- **Prompt**: `src/prompts.ts` → `VISIONER_SYSTEM`

### 🧩 Stratejist (Strategist)
- **Sorusu**: "Bu NASIL organize edilir?"
- **Rolü**: Vizyonu 5-8 bloğa parçalar, her bloğu 3-6 atoma böler (fraktal decomposition)
- **Model**: `kimi-k2.5` (primary), `gemini-3.1-pro-high` (fallback)
- **Kurallar**: Max 8 blok, max 6 atom/blok. Vizyon tutarsızsa vizyoneri BLOCK'layabilir
- **Max thought/chain**: 30
- **Prompt**: `src/prompts.ts` → `STRATEGIST_SYSTEM`

### 🔍 Araştırmacı (Researcher)
- **Sorusu**: "Başkaları NE yaptı?"
- **Rolü**: Her karar öncesi kanıt toplar. Best practice, benchmark, risk analizi.
- **Model**: `kimi-k2.5` (primary), `gpt-4o` (fallback)
- **Kurallar**: Kaynak belirtmek zorunlu, risk/tradeoff açıkça yazılmalı. Stratejisti BLOCK'layabilir
- **Max thought/chain**: 20
- **Prompt**: `src/prompts.ts` → `RESEARCHER_SYSTEM`

### ⚡ İşçi (Worker)
- **Sorusu**: "BURADA ne yapmalıyım?"
- **Rolü**: Tek atomik görevi uygular — 8 adımlık zorunlu protokolle
- **Model**: `kimi-k2.5` (primary), `claude-sonnet` (fallback)
- **Kurallar**: Araştırma gerektirmez ama doğrulama zorunlu. Stratejisti BLOCK'layabilir
- **Max thought/chain**: 15
- **8-Adım Protokol** (boş bırakılamaz):
  1. `READ` — Hedef dosyayı oku, ilgili satırları bul
  2. `CONTEXT` — Mevcut kodu anla, bağımlılıkları gör
  3. `IMPACT` — Yan etkileri değerlendir
  4. `DECIDE` — Ne yazacağına karar ver
  5. `PREDICT` — Değişiklikten sonra ne olacak
  6. `EXECUTE` — Kodu yaz
  7. `VERIFY` — Build çalışıyor mu, beklenti karşılandı mı
  8. `REPORT` — Özet, beklenmedik şey var mı

---

## Advanced Internal Capabilities (Void-derived)

Foreman'a Void (VS Code fork) reposundan transfer edilmiş ileri düzey yapılar:

### 1. Model Capabilities (`src/model-capabilities.ts`)
- Provider-aware reasoning: Anthropic thinking blocks, OpenAI reasoning_effort, Gemini thinkingConfig
- Model detection: `getModelCapabilities(provider, model)` → tools, images, reasoning, FIM desteği
- Reasoning slider: `getReasoningConfig(provider, effort)` → budget_tokens veya effort level
- Provider auto-detection: model isminden provider çıkarır (claude → anthropic, gpt → openai, gemini → google)

### 2. Streaming Reasoning (`src/streaming-reasoning.ts`)
- `extractReasoning(text)` → `<think>...</think>` taglerini ayırır, clean text döner
- `extractAllReasoningBlocks(text)` → birden fazla think bloğunu parse eder
- `analyzeReasoningContent(text)` → reasoning var mı, kalitesi ne, uzunluğu ne
- `SurroundingsRemover` → LLM çıktısından gereksiz prefix/suffix temizler
- FIM extraction: `extractCodeFromRegular()`, `extractCodeFromFIM()`

### 3. Provider Types (`src/provider-types.ts`)
- Typed message formats: Anthropic `content_block`, OpenAI `tool_calls`, Gemini `functionCall`
- `convertMessagesForProvider(messages, provider)` → SimpleLLMMessage → provider-specific format
- `AbortRef` pattern: graceful cancellation for long-running LLM calls
- Callback types: `OnText`, `OnFinalMessage`, `OnError` for streaming

### 4. Code Extraction (`src/code-extraction.ts`)
- `SurroundingsRemover` — intelligent prefix/suffix stripping with configurable matchers
- SEARCH/REPLACE block parsing from LLM output
- FIM (Fill-In-Middle) code extraction
- Language-aware code fence extraction

### 5. Advanced Edit Engine (`src/edit-engine.ts`)
- `findTextInFileContents()` — Void'un whitespace-insensitive matching algoritması
- 5-tier cascade: exact → trim → whitespace-normalize → line-by-line fuzzy → best match
- `findBestMatch()` — Levenshtein-like scoring ile en yakın eşleşmeyi bulur
- Whitespace farklılıkları nedeniyle edit başarısızlığı artık imkansız

### 6. Abort Mechanism (`src/abort-ref.ts`)
- `AbortRef` type: `{ current: boolean }` — simple cancellation flag
- Long-running LLM çağrılarını graceful iptal etme

### Forge Pipeline Enhancements
- Atom çıktılarından otomatik reasoning extraction
- Model-capability-aware error recovery
- Provider-specific optimizasyonlar (reasoning model kullanılıyorsa retry stratejisi değişir)

---

## Atomik Birim: Thought

Sistemin en küçük birimi. Her vizyon, strateji, araştırma ve kod parçası bir Thought:

```
1 input → muhakeme → 1 output
```

**Kurallar:**
- `reasoning` ASLA boş olamaz — validator enforce eder (`src/validators.ts`)
- `output` "done" durumunda boş olamaz
- `confidence` 0-1 arası, düşükse üst katman bilgilendirilir
- Worker thought'ları 8-adım protokolsüz "done" olamaz
- Her thought JSON dosyası: `thoughts/t_xxx.json`

---

## Pipeline Akışı

```
Görev girer
    ↓
🔮 VİZYON — "Bu projenin ruhu ne?"
    ↓
🧩 PARÇALAMA — "5-8 blok" (stratejist)
    ↓
Her blok için:
  🔍 ARAŞTIRMA — "Bu blok için best practice ne?"
  🧩 ATOMİZE — "3-6 atom" (stratejist)
      ↓
  Her atom için:
    ⚡ UYGULAMA — 8-adım protokol (işçi)
    🔬 DOĞRULAMA
      ↓
  🪞 YANSIMA (her 5 atomda) — "Vizyondan saptık mı?"
    ↓
🏁 TAMAMLANDI
```

**Bidirectional akış**: Alt katman üst katmanı değiştirebilir:
- İşçi → Stratejist: "Bu atom imkansız" (BLOCK sinyali)
- Stratejist → Vizyoner: "Vizyon tutarsız" (BLOCK sinyali)
- BLOCK durumunda pipeline durur, üst katman replan yapar

---

## State Machine

Sistem her an TEK BİR durumda. Geçerli geçişler (`src/types.ts` → `VALID_TRANSITIONS`):

```
idle → visioning
visioning → decomposing | blocked
decomposing → researching | executing | blocked
researching → decomposing | executing | blocked
executing → verifying | blocked
verifying → executing | reflecting | blocked | complete
reflecting → executing | decomposing | visioning | blocked
blocked → decomposing | visioning | awaiting_human
awaiting_human → executing | decomposing | visioning | idle
complete → idle
```

Her geçiş:
- `reason` zorunlu (boşsa `MissingReasonError`)
- Tanımsız geçiş → `InvalidTransitionError`
- Otomatik persist (state.json'a yazılır)
- Audit trail (`history` dizisi, max 200 kayıt)

---

## Proje Yapısı

```
foreman/
├── VISION.md              — Ürün vizyonu (problem, çözüm, ilkeler)
├── ARCHITECTURE.md        — Teknik mimari (interface'ler, state machine)
├── STATE.md               — Anlık build durumu (her session başında oku)
├── AGENTS.md              — Bu dosya
├── CLAUDE.md              → AGENTS.md symlink
├── README.md              — Kurulum & hızlı başlangıç
├── install.sh             — One-liner installer (curl | bash)
├── uninstall.sh           — Kaldırma scripti
│
├── src/
│   ├── types.ts           — 603 LOC, tüm core tipler (Layer, Thought, Chain, SystemState, WorkerProtocol, RateLimitConfig, ForemanState)
│   ├── state.ts           — StateManager: create/load/save/transition/canTransition, auto-persist, audit trail
│   ├── thought-manager.ts — ThoughtManager: CRUD, auto-increment ID (t_001, t_002...)
│   ├── chain-manager.ts   — ChainManager: CRUD, addThought, updateStatus
│   ├── validators.ts      — validateThoughtCompletion: reasoning/output/confidence/workerProtocol kontrol
│   ├── rate-limiter.ts    — RateLimiter: throttle (3s min), burst (15/min), model rotation, token budget
│   ├── provider.ts        — LLMProvider interface (with streamChatWithTools), MockProvider, ProviderRegistry
│   ├── kimi-provider.ts   — KimiProvider: Moonshot API, K2.5/K2-thinking models, tool calling, reasoning_content
│   ├── antigravity-provider.ts — AntigravityProvider: Google OAuth, Gemini/Claude/GPT via proxy
│   ├── anthropic-provider.ts — AnthropicProvider: SDK, model mapping, token tracking
│   ├── openai-provider.ts — OpenAIProvider: SDK, model mapping, token tracking
│   ├── prompts.ts         — 4 katman system prompt, context builder, user prompt builder
│   ├── engine.ts          — Engine: think(), step(), LLM response parsing, rate limit + state integration
│   ├── orchestrator.ts    — Orchestrator: run() tam pipeline, event system, block detection, reflection
│   ├── setup.ts           — API key wizard: interactive input, live validation, ~/.foreman/config.json
│   ├── theme.ts           — CLI visual theme: brand colors, gradient logo, phase icons, status box
│   ├── cli.ts             — Commander.js CLI: setup, init, run, status, thoughts, chains, history, providers, doctor
│   │
│   ├── state.test.ts      — 14 test (state machine)
│   ├── persistence.test.ts — 25 test (thought/chain CRUD, validators)
│   ├── rate-limiter.test.ts — 12 test (throttle, rotation, budget)
│   ├── engine.test.ts     — 10 test (think, step, parsing)
│   └── orchestrator.test.ts — 5 test (pipeline)
│
├── thoughts/              — Thought MD dosyaları (t_001.md ... t_019.md)
├── chains/                — Chain MD dosyaları (chain_001 ... chain_008)
└── projects/              — Yönetilen projeler (henüz boş)
```

---

## CLI Komutları

| Komut | Açıklama |
|-------|----------|
| `foreman setup` | API key wizard (Anthropic/OpenAI), live validation |
| `foreman init <name>` | Yeni proje: state.json + thoughts/ + chains/ |
| `foreman run <task>` | Tam pipeline çalıştır (vision→execute→reflect) |
| `foreman run <task> --mock` | MockProvider ile test |
| `foreman status` | Gold-bordered durum kutusu |
| `foreman thoughts [-c chain] [-s status]` | Thought listesi (ikon + confidence) |
| `foreman chains` | Chain listesi |
| `foreman history [-n count]` | State geçiş logları |
| `foreman providers` | Provider durumu (masked key) |
| `foreman doctor` | Sistem sağlık kontrolü |

---

## Rate Limiter

| Parametre | Varsayılan | Açıklama |
|-----------|------------|----------|
| `minDelayBetweenCalls` | 3000ms | Çağrılar arası minimum bekleme |
| `maxCallsPerMinute` | 15 | Burst koruması |
| `cooldownAfterBurst` | 30000ms | Burst sonrası soğuma |
| `maxRetries` | 5 | 429 sonrası yeniden deneme |
| `backoffStrategy` | exponential | 3s → 6s → 12s → 24s → 48s |
| `budget.perThought` | 4096 | Token/thought |
| `budget.perChain` | 50000 | Token/chain |
| `budget.perSession` | 200000 | Token/session |

Test'te: `rateLimitOverride: { minDelayBetweenCalls: 0 }` ile delay kapatılır.

---

## Config & Credentials

- **User config**: `~/.foreman/config.json` (API key'ler, default provider)
- **Proje state**: `./state.json` (çalışma dizininde, auto-persist)
- **Env var'lar öncelikli**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- **Global binary**: `~/.foreman/bin/foreman` (install.sh ile kurulur)

---

## Build & Test

```bash
npm install                    # bağımlılıklar
npm test                       # 66 test (state + persistence + rate-limiter + engine + orchestrator)
npx tsx src/cli.ts ...         # CLI dev mode
npx tsx src/state.test.ts      # tek test dosyası
```

---

## Coding Style

- TypeScript (ESM), `"type": "module"`
- Strict typing, `any` yasak
- Test: Node.js built-in `node:test` + `node:assert`
- Her yeni özellik için test zorunlu
- Commit: `chain_XXX: açıklama` veya `fix: açıklama`
- `node_modules` ASLA düzenlenmez

---

## Theme (Visual Identity)

Tüm CLI görselleri `src/theme.ts`'de:

| Renk | Hex | Kullanım |
|------|-----|----------|
| Gold | `#F5A623` | Ana brand, header, box border |
| Cyan | `#00D4FF` | Linkler, research katmanı |
| Purple | `#A855F7` | Reflection, stratejist |
| Green | `#22C55E` | Başarı, done |
| Red | `#EF4444` | Hata, block |
| Dim | `#6B7280` | Metadata, zaman |

- ASCII gradient logo (gold → orange → purple)
- Phase ikonları: 🔮 🧩 🔍 ⚛️ ⚡ 🔬 🪞 🏁
- Status ikonları: ✔ ✖ ⚠ 🚫 ○ ◉

---

## Sonraki Adımlar (Roadmap)

### ✅ Tamamlanan Fazlar
- [x] Faz 2: Gerçek LLM Integration (Anthropic, OpenAI, Gemini, Antigravity, Kimi)
- [x] Faz 3: Research Engine (web search, link intelligence, file system araştırma)
- [x] Faz 4: Execution Engine (dosya R/W, build/test, git, screenshot verification)
- [x] Faz 5: Context & Memory (context guard, memory-md-bridge, session manager)
- [x] Faz 6: Void Integration (model capabilities, streaming reasoning, provider types, advanced edit engine)

### Aktif Fazlar
- [ ] Forge Pipeline optimizasyonu (daha az token, daha hızlı execution)
- [ ] Multi-agent parallelism (sub-agent spawning for independent atoms)
- [ ] Self-improving prompts (başarı/başarısızlık feedback loop)
- [ ] Browser automation (Playwright/CDP entegrasyonu ile visual QA)

---

## Kritik Kısıtlar

1. **Mock-first development**: Önce MockProvider ile test, sonra gerçek LLM
2. **Her thought muhakemeli**: Reasoning boşsa validator reject eder
3. **Worker 8-adım zorunlu**: Protokol eksikse thought "done" olamaz
4. **State geçişleri kısıtlı**: VALID_TRANSITIONS dışı geçiş → InvalidTransitionError
5. **Rate limit saygılı**: Burst/throttle/budget aşımında BudgetExceededError
6. **Bidirectional BLOCK**: Alt katman üst katmanı durdurabilir
7. **Disiplin > Hız**: "Aşırı disiplinli, acele etmeden ağır ağır inşa et"

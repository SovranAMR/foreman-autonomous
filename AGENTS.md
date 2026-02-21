# Foreman — Agent Guidelines

## Repo
- GitHub: https://github.com/SovranAMR/foreman (private)
- Local: `/home/sovranamr/projects/foreman/`

## Project Structure
```
src/
  types.ts          — 603 LOC, tüm core tipler
  state.ts          — StateManager (create/load/save/transition)
  thought-manager.ts — ThoughtManager CRUD
  chain-manager.ts  — ChainManager CRUD
  validators.ts     — thought/worker protocol validation
  rate-limiter.ts   — throttle, model rotation, token budget
  provider.ts       — LLMProvider interface, MockProvider, ProviderRegistry
  anthropic-provider.ts — Anthropic SDK entegrasyonu
  openai-provider.ts    — OpenAI SDK entegrasyonu
  prompts.ts        — 4 katman system prompt'ları
  engine.ts         — Engine (think, step), response parsing
  orchestrator.ts   — Full pipeline (vision → execute → reflect)
  setup.ts          — API key kurulum wizard
  theme.ts          — CLI visual theme (renkler, ikonlar, gradientler)
  cli.ts            — Commander.js CLI
  *.test.ts         — Test dosyaları (66 test total)

thoughts/          — Thought MD dosyaları (t_001.md, t_002.md, ...)
chains/            — Chain MD dosyaları (chain_001_types.md, ...)
```

## Architecture — 4 Layer
1. **Visioner** (🔮): Ruh, yön, estetik — "NEDEN?"
2. **Strategist** (🧩): Parçalama, planlama — "NASIL?"
3. **Researcher** (🔍): Bilgi toplama — "NE?"
4. **Worker** (⚡): Uygulama + 8-adım protokol — "BURADA ne yapmalıyım?"

## Atomic Unit = Thought
- `1 input → muhakeme → 1 output`
- Reasoning ASLA boş olamaz
- Worker: read → context → impact → decide → predict → execute → verify → report

## Build & Test
```bash
npm install              # bağımlılıklar
npm test                 # tüm testler (66 test)
npx tsx src/cli.ts ...   # CLI'yı dev'de çalıştır
```

## Key Files to Read First
1. `STATE.md` — Anlık build durumu
2. `VISION.md` — Ürün vizyonu
3. `ARCHITECTURE.md` — Teknik mimari
4. `src/types.ts` — Tüm tip tanımları

## Coding Style
- TypeScript (ESM), strict typing
- Test: Node.js built-in `node:test` + `node:assert`
- Her yeni özellik için test zorunlu
- Commit mesajları: `chain_XXX: açıklama` veya `fix: açıklama`

## State Machine Rules
- Geçerli geçişler: `VALID_TRANSITIONS` (types.ts)
- Her geçiş `reason` zorunlu
- Auto-persist (her transition disk'e yazılır)

## Rate Limiter
- Min delay: 3s (test'te 0'a çekilebilir — `rateLimitOverride`)
- Burst: 15 calls/min
- Model rotation: primary → fallback on 429
- Token budget: per-thought/chain/session

## CLI Commands
```
foreman setup       — API key wizard
foreman init <name> — proje oluştur
foreman run <task>  — tam pipeline çalıştır
foreman status      — durum kutusu
foreman thoughts    — thought listesi
foreman chains      — chain listesi
foreman history     — state geçişleri
foreman providers   — provider durumu
foreman doctor      — sistem kontrolü
```

## Theme
- Brand renkleri: `src/theme.ts`
- Ana renk: gold (#F5A623)
- Gradient logo, phase ikonları, status box
- Değişiklik tek dosyadan: `theme.ts`

## Config
- User config: `~/.foreman/config.json` (API key'ler)
- Proje state: `./state.json` (çalışma dizininde)
- Env var'lar öncelikli: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`

## Constraints
- Mock-first development: önce MockProvider ile test, sonra gerçek LLM
- Test'te rate limit delay = 0 (`rateLimitOverride: { minDelayBetweenCalls: 0 }`)
- node_modules ASLA düzenlenmez

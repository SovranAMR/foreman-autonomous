# Foreman

AI agent orkestratör — atomik düşünce zincirleriyle vizyon, araştırma ve taktik muhakeme.

## Ne?

Foreman, AI agent'ları disiplinize eden bir orkestratör. Her görevi atomik düşüncelere parçalar, her düşünceden önce araştırır ve muhakeme eder, her düşünceden sonra doğrular.

## 4 Katman

| Katman | Rol | Sorusu |
|--------|-----|--------|
| **Vizyoner** | Ruh, yön, estetik | "Bu NEDEN var?" |
| **Stratejist** | Parçalama, planlama | "Bu NASIL organize edilir?" |
| **Araştırmacı** | Bilgi toplama | "Başkaları NE yaptı?" |
| **İşçi** | Uygulama + taktik muhakeme | "BURADA ne yapmalıyım?" |

## Temel Birim: Thought (Düşünce)

```
1 input → muhakeme → 1 output
```

Her şey — vizyon, strateji, araştırma, kod — düşünce zincirleriyle inşa edilir.

## İşçi Protokolü

İşçi körlemesine kod yazmaz. 8 adımlık zorunlu protokol:

1. **READ** — Hedef dosyayı oku
2. **CONTEXT** — Mevcut kodu anla
3. **IMPACT** — Yan etkileri değerlendir
4. **DECIDE** — Ne yazacağına karar ver
5. **PREDICT** — Sonucu hayal et
6. **EXECUTE** — Kodu yaz
7. **VERIFY** — Doğrula
8. **REPORT** — Raporla

## Kurulum

```bash
git clone https://github.com/SovranAMR/foreman.git
cd foreman
npm install
```

## Kullanım

```bash
# Yeni proje
npx tsx src/cli.ts init "Proje Adı"

# Durum
npx tsx src/cli.ts status

# Görev çalıştır
npx tsx src/cli.ts run "Hero section tasarla"

# Geçmişi göster
npx tsx src/cli.ts history

# Thought listesi
npx tsx src/cli.ts thoughts

# Chain listesi
npx tsx src/cli.ts chains
```

## Test

```bash
npm test
# 61 test, 0 fail
```

## Mimari

```
src/
├── types.ts           — Temel tipler (Thought, Chain, Layer, State)
├── state.ts           — State machine (geçiş kuralları, persist)
├── thought-manager.ts — Thought CRUD (JSON dosyalar)
├── chain-manager.ts   — Chain CRUD
├── validators.ts      — Disiplin guardrails
├── rate-limiter.ts    — Throttle, model rotasyonu, token bütçesi
├── provider.ts        — LLM abstraction (mock + gerçek)
├── prompts.ts         — 4 katman system prompts
├── engine.ts          — Ana motor (think, step)
└── cli.ts             — Komut satırı arayüzü
```

## Durum

**Faz 0: Temel İnşa** ✅ Tamamlandı

- [x] Tip sistemi (603 satır)
- [x] State machine (14 test)
- [x] Persistence — Thought/Chain (25 test)
- [x] Rate limiter (12 test)
- [x] Engine (10 test)
- [x] CLI
- [ ] Gerçek LLM provider'lar (Anthropic, OpenAI, Google)
- [ ] Orkestratör pipeline (vision → decompose → research → execute)
- [ ] Web araştırma motoru
- [ ] Kod yazma/düzenleme execution engine

## Lisans

MIT

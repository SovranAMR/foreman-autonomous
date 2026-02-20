# FOREMAN — Architecture Document

## Sistemin Kalbi: Thought (Düşünce)

Her şey bir Thought'tan inşa ediliyor. Thought, sistemin atom'u.

```typescript
interface Thought {
  id: string;              // "t_001"
  chainId: string;         // hangi zincire ait
  layer: Layer;            // visioner | strategist | researcher | worker
  
  // Input
  input: string;           // bu düşüncenin sorusu
  contextRefs: string[];   // bağımlı olduğu önceki düşünceler
  
  // Muhakeme (ZORUNLU)
  reasoning: string;       // neden bu kararı veriyorum
  
  // Araştırma (opsiyonel)
  needsResearch: boolean;
  researchQuery?: string;
  researchFindings?: string;
  
  // Output
  output: string;          // bu düşüncenin cevabı
  confidence: number;      // 0-1, ne kadar eminim
  
  // Doğrulama
  needsVerification: boolean;
  verificationMethod?: "build" | "metric" | "screenshot" | "logic";
  verified?: boolean;
  
  // Akış
  status: "pending" | "thinking" | "researching" | "executing" | "verifying" | "done" | "blocked" | "reverted";
  next?: string;           // sonraki thought id
  blockedReason?: string;  // neden durdu
  
  // Meta
  createdAt: string;
  completedAt?: string;
  tokenCost?: number;
  model?: string;          // hangi LLM kullanıldı
}
```

## Chain (Zincir)

Thought'lar zincir halinde birbirine bağlı. Bir Chain, bir amaca yönelik düşünce dizisi.

```typescript
interface Chain {
  id: string;              // "chain_001_core"
  name: string;            // "Core Engine"
  layer: Layer;            // hangi katmana ait
  parentChainId?: string;  // üst zincir (hiyerarşik)
  
  thoughts: string[];      // thought id listesi (sıralı)
  
  status: "active" | "paused" | "completed" | "blocked";
  
  // Bağlam
  goal: string;            // bu zincirin amacı
  contextSummary: string;  // önceki zincirlerin özeti (context compression)
}
```

## Layer (Katman)

```typescript
type Layer = "visioner" | "strategist" | "researcher" | "worker";

interface LayerConfig {
  layer: Layer;
  model: string;           // tercih edilen LLM
  maxThoughtsPerChain: number;  // bir zincirde max düşünce
  requiresResearch: boolean;     // araştırma zorunlu mu
  requiresVerification: boolean; // doğrulama zorunlu mu
  canBlockParent: boolean;       // üst katmanı durdurabilir mi
}

const LAYER_CONFIGS: Record<Layer, LayerConfig> = {
  visioner: {
    layer: "visioner",
    model: "claude-opus",
    maxThoughtsPerChain: 50,
    requiresResearch: true,
    requiresVerification: true,    // vizyon tutarlılık kontrolü
    canBlockParent: false,         // en üst katman
  },
  strategist: {
    layer: "strategist", 
    model: "claude-opus",
    maxThoughtsPerChain: 30,
    requiresResearch: true,
    requiresVerification: true,
    canBlockParent: true,          // vizyoneri durdurabilir
  },
  researcher: {
    layer: "researcher",
    model: "gpt-4o",
    maxThoughtsPerChain: 20,
    requiresResearch: true,        // zaten araştırma katmanı
    requiresVerification: false,
    canBlockParent: true,          // stratejisti durdurabilir
  },
  worker: {
    layer: "worker",
    model: "claude-sonnet",
    maxThoughtsPerChain: 15,
    requiresResearch: false,       // taktik düşünce, derin araştırma yok
    requiresVerification: true,    // build/test zorunlu
    canBlockParent: true,          // stratejisti durdurabilir
  },
};
```

## State Machine

Sistem her an TEK BİR durumda:

```typescript
type SystemState = 
  | "idle"           // hiçbir şey yapmıyor
  | "visioning"      // vizyon oluşturuluyor
  | "decomposing"    // parçalanıyor (stratejist)
  | "researching"    // araştırılıyor
  | "executing"      // atom yapılıyor (işçi)
  | "verifying"      // kontrol ediliyor
  | "reflecting"     // geri bakılıyor
  | "blocked"        // problem var
  | "awaiting_human" // insan onayı bekliyor
  | "complete";      // bitti

// Geçerli geçişler
const VALID_TRANSITIONS: Record<SystemState, SystemState[]> = {
  idle:            ["visioning"],
  visioning:       ["decomposing", "blocked"],
  decomposing:     ["researching", "executing", "blocked"],
  researching:     ["decomposing", "executing", "blocked"],
  executing:       ["verifying", "blocked"],
  verifying:       ["executing", "reflecting", "blocked", "complete"],
  reflecting:      ["executing", "decomposing", "visioning", "blocked"],
  blocked:         ["decomposing", "visioning", "awaiting_human"],
  awaiting_human:  ["executing", "decomposing", "visioning", "idle"],
  complete:        ["idle"],
};
```

## Worker Think Protocol

İşçinin her atom için zorunlu düşünme adımları:

```typescript
interface WorkerProtocol {
  // Yapmadan ÖNCE
  step1_read:    string;   // "Hedef dosyayı oku, ilgili satırları bul"
  step2_context: string;   // "Mevcut kodu anla — ne var, ne yok, ne bağlı"
  step3_impact:  string;   // "Bu değişiklik neyi etkiler? Yan etki var mı?"
  step4_decide:  string;   // "Tam olarak ne yazacağım, nereye yazacağım"
  step5_predict: string;   // "Bu değişiklikten sonra ne olacak"
  
  // Yapma
  step6_execute: string;   // "Kodu yaz"
  
  // Yaptıktan SONRA
  step7_verify:  string;   // "Build çalışıyor mu? Beklentim karşılandı mı?"
  step8_report:  string;   // "Ne yaptım, ne değişti, beklenmedik şey var mı"
}
```

## Rate Limiting

```typescript
interface RateLimitConfig {
  minDelayBetweenCalls: number;     // ms — minimum bekleme
  maxCallsPerMinute: number;        // burst koruması
  cooldownAfterBurst: number;       // ms — burst sonrası bekleme
  backoffStrategy: "exponential";   // 429 sonrası
  maxRetries: number;
  
  // Model rotasyonu — tek provider'a yüklenmemek için
  modelRotation: {
    primary: string;
    fallback: string[];
    rotateOn429: boolean;
  };
  
  // Token bütçesi
  budget: {
    perThought: number;             // max token per düşünce
    perChain: number;               // max token per zincir
    perSession: number;             // max token per oturum
  };
}
```

## Dosya Yapısı

```
/foreman/
├── VISION.md                 ← Foreman'ın kendisi için vizyon
├── ARCHITECTURE.md           ← Bu dosya
├── STATE.md                  ← Anlık durum (her session'da ilk oku)
│
├── src/
│   ├── types.ts              ← Thought, Chain, Layer, State tipleri
│   ├── engine.ts             ← Ana motor — think(), research(), execute()
│   ├── state.ts              ← State machine — transition(), current()
│   ├── chain.ts              ← Zincir yönetimi — create(), append(), block()
│   ├── thought.ts            ← Düşünce yaratma, muhakeme, doğrulama
│   ├── rate-limiter.ts       ← Rate limit, model rotasyonu, bütçe
│   ├── researcher.ts         ← Web araştırma, kaynak toplama
│   ├── worker-protocol.ts    ← 8-adım işçi protokolü
│   ├── persistence.ts        ← Düşünceleri dosyaya yazma/okuma
│   └── cli.ts                ← CLI interface
│
├── chains/                   ← Zincir tanımları (MD)
├── thoughts/                 ← Her düşünce ayrı dosya (MD)
└── projects/                 ← Foreman'ın yönettiği projeler
```

## Teknoloji Kararları

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| Dil | TypeScript | Tip güvenliği, OpenClaw ekosistemi |
| Runtime | Bun | Hızlı, TypeScript native |
| LLM SDK | Vercel AI SDK | Multi-provider, streaming, type-safe |
| Persistence | Dosya sistemi (MD/YAML) | Git-native, insan okunabilir, basit |
| CLI | Commander.js | Standart, hafif |
| State | In-memory + dosya sync | Basit, crash-safe |

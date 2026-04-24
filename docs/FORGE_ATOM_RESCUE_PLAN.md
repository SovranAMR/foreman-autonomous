# Forge Atom Rescue + Pipeline Recovery — Design Plan

**Status**: Approved by Ali, pending implementation
**Branch (planned)**: `fix/forge-atom-rescue-and-recovery`
**Scope**: `src/orchestrator.ts`, `src/prompts.ts`, `src/types.ts`, tests
**ETA**: ~3 hours

---

## Problem

Forge pipeline'da atom fail → `MAX_ATOM_RETRIES` (3) sonrası **skip**. Skip olunca:
- Atom'un üretmesi gereken feature site'a girmiyor (örn. canvas particles, SEO meta tags)
- Tek-atom block'larda fail → blok hiç iş üretmiyor
- Mevcut `re_decompose` koşulu çok dar: `blockSuccessRate < 0.5 && atoms.length > 1`
  - Block 1 (2/3 pass = 66%) → skip, re_decompose atlanır
  - Block 4 (0/1 pass, tek atom) → skip, re_decompose atlanır
  - Block 5 (0/2 pass, 2 atom) → ✓ re_decompose tetiklendi

Yani kurtarma mekanizması **kısmen var** ama sıkı koşullar yüzünden büyük işleri kaçırıyor. **İsraf değil, kayıp.**

## Hedef

> Hiçbir atom çöpe gitmesin, israf da olmasın. Atom fail → lokalde kurtarmaya çalış, olmazsa kuyruğa at, pipeline sonunda toplu telafi et.

## Felsefe: 4 Katmanlı Savunma

> **Öğrenilmiş gerçek** (2026-04-24 canlı test): 1h39m çalışan pipeline, Block 6 Atom 1'de Kimi API'dan gelen `fetch failed` uncaught olup process crashed. Atom/block seviyesi rescue kafi değil — **transport layer**'a resilience şart.

```
[Herhangi LLM çağrısı]
  ↓
Katman 0: TRANSPORT RESILIENCE (globally applied in engine.callLLM)
  ├── Catch: fetch failed, ECONNRESET, ECONNREFUSED, ETIMEDOUT, socket hang up, terminated
  ├── Exponential backoff: 5s → 15s → 45s (3 attempts)
  ├── Her attempt'te streaming.warning ile log
  ├── 3 attempt sonunda hala fail → tek taraflı throw, atom seviyesine teslim
  └── Kritik: asla uncaught, asla process crash
  ↓
[Atom fail (execution veya reviewer reject)]
  ↓
Katman 1: ATOM RESCUE (inline, 1 kademe split)
  ├── 3 retry sonrası → Strategist'e "mini-split" isteği
  ├── Atom → 2-3 daha küçük mini-atom (tek dosya/fonksiyon/criterion)
  ├── Mini-atomlar 2 retry ile QA'dan geçer
  └── Mini-atom da fail ⇒ recoveryQueue.push()
  ↓
[Block devam eder — momentum korunur]
  ↓
Katman 2: BLOCK RE-DECOMPOSE (mevcut, gevşetilmiş koşul)
  ├── blockSuccessRate < 1.0 (her fail → tetikle)
  ├── atoms.length > 1 şartı KALDIRILDI (tek-atom bloklar da re-decompose'a)
  ├── Strategist re-atomize eder, full QA pipeline ile çalışır
  └── Kalan fail ⇒ recoveryQueue.push()
  ↓
[Tüm bloklar + reflection tamam]
  ↓
Katman 3: END-OF-PIPELINE RECOVERY
  ├── ASSESS: Her kuyruktaki atom için site fs state vs atom requirement
  │   └── Başka blok farkında olmadan telafi etmiş olabilir → "compensated" işaretle
  ├── FILTER: Gerçekten eksik olanları tut
  ├── RE-BATCH: Bunları yeni mini-vision gibi context'e ver
  ├── Strategist yeniden decompose → Full QA ile execute
  └── FINAL REFLECTION: "Recovery sonrası vizyon-gerçek boşluğu?"
```

## Neden C+B'den Daha Mantıklı

| Boyut | Pure C (recursive split) | Pure B (recovery only) | **Hybrid** |
|---|---|---|---|
| Atom kaybı | 0 (sonsuz böl) | N (block sonuna kadar bekler) | 0-1 (split deneyip geçer) |
| Token israfı | Çok (recursion) | Orta (end-to-end tekrar) | **Düşük** (1 kademe split + son faz topla) |
| Block momentum | Yok (tıkanır) | Yok (bitene kadar bilinmez) | **Var** (block ilerler, queue biriker) |
| Cross-block telafi | Yok | Yok | **Var** (assess fazında) |
| Felsefe: "tek-pass çok iyi proje" | ✗ (agresif) | ✓ | **✓✓** |

## Implementation Detayları

### 1. `src/types.ts` — recoveryQueue

```typescript
export interface FailedAtom {
  atom: string;
  blockIndex: number;
  atomIndex: number;
  failureReason: string;       // reviewer feedback veya execution error
  attemptsUsed: number;        // primary retries + rescue retries
  rescueAttempted: boolean;    // Katman 1 denedik mi
  timestamp: number;
}

// ForemanState'e ekle:
export interface ForemanState {
  // ...
  recoveryQueue?: FailedAtom[];
}
```

### 2. `src/orchestrator.ts` — rescueAtom()

```typescript
/**
 * Katman 1: Atom-level split rescue.
 * Primary atom retries exhausted. Split into 2-3 mini-atoms and try once more.
 * @returns { rescued: boolean, completedMiniAtoms: number }
 */
private async rescueAtom(
  atom: string,
  failureReason: string,
  block: string,
  visionSummary: string,
  findings: string,
  blockIdx: number,
  atomIdx: number,
  visionChainId: string,
): Promise<{ rescued: boolean; completedMiniAtoms: number; failedMiniAtoms: string[] }> {
  this.engine.streaming.phaseStart("atom_rescue", `Splitting atom ${atomIdx + 1} into mini-atoms`);

  // Strategist'e split isteği — ATOM_RESCUE_SYSTEM promptu ile
  const splitResult = await this.engine.stepWithPhase(
    visionChainId,
    `ATOM FAILED after ${this.MAX_ATOM_RETRIES} retries.\n\n` +
    `ORIGINAL ATOM:\n${atom}\n\n` +
    `FAILURE REASON:\n${failureReason}\n\n` +
    `BLOCK CONTEXT:\n${block}\n\n` +
    `Split this into 2-3 SMALLER mini-atoms. Each mini-atom:\n` +
    `- Targets ONE file + ONE specific change\n` +
    `- Has ONE acceptance criterion (testable)\n` +
    `- Avoids the failure pattern above\n` +
    `- Uses exact file paths and line anchors`,
    "strategist",
    "rescue_split",
  );

  const miniAtoms = splitResult.parsed?.atoms ?? this.fallbackParseBlocks(splitResult.thought.output);
  if (miniAtoms.length === 0) {
    this.engine.streaming.phaseEnd("atom_rescue", "split failed — queueing");
    return { rescued: false, completedMiniAtoms: 0, failedMiniAtoms: [atom] };
  }

  let completed = 0;
  const failed: string[] = [];
  for (const mini of miniAtoms) {
    const ok = await this.executeAtomWithRetries(mini, block, visionSummary, findings, {
      maxRetries: 2,        // Lower — we're already in a recovery path
      allowRescue: false,   // NO recursion — 1 kademe rule
      blockIdx,
      atomIdx,
      visionChainId,
    });
    if (ok) completed++;
    else failed.push(mini);
  }

  const rescued = completed > 0;
  this.engine.streaming.phaseEnd("atom_rescue",
    `${completed}/${miniAtoms.length} mini-atoms rescued`);
  return { rescued, completedMiniAtoms: completed, failedMiniAtoms: failed };
}
```

**Caller değişikliği** (primary retry loop sonunda, skip yerine):
```typescript
if (!atomPassed) {
  // Katman 1: Rescue attempt
  const rescue = await this.rescueAtom(atom, lastRejectionFeedback, block, ...);
  if (!rescue.rescued || rescue.failedMiniAtoms.length > 0) {
    // Katman 3 için kuyruğa at
    this.engine.state.pushRecovery({
      atom: rescue.failedMiniAtoms.length > 0 ? rescue.failedMiniAtoms.join("\n---\n") : atom,
      blockIndex: i,
      atomIndex: j,
      failureReason: lastRejectionFeedback,
      attemptsUsed: this.MAX_ATOM_RETRIES + 2,
      rescueAttempted: true,
      timestamp: Date.now(),
    });
  }
  // Block devam etsin
  continue;
}
```

### 3. `src/orchestrator.ts` — re_decompose koşul gevşetme

```typescript
// Önce:
if (blockSuccessRate < 0.5 && atoms.length > 1) {

// Sonra:
if (blockSuccessRate < 1.0) {   // Herhangi bir fail → tetikle (tek-atom dahil)
```

### 4. `src/orchestrator.ts` — runRecoveryPhase()

```typescript
/**
 * Katman 3: Pipeline sonunda tüm kaçan atomları topla, site state ile karşılaştır,
 * gerçekten eksik olanları re-batch ve execute et.
 */
private async runRecoveryPhase(
  visionOutput: string,
  visionChainId: string,
): Promise<{ attempted: number; completed: number; stillFailed: number }> {
  const queue = this.engine.state.getRecoveryQueue();
  if (queue.length === 0) return { attempted: 0, completed: 0, stillFailed: 0 };

  this.engine.streaming.phaseStart("recovery", `Processing ${queue.length} queued atoms`);

  // 1. ASSESS: her atom için fs state check
  const assessment = await this.engine.callLLM(
    RECOVERY_ASSESS_SYSTEM,
    `VISION:\n${visionOutput}\n\n` +
    `FILE TREE:\n${await this.snapshotProjectFiles()}\n\n` +
    `QUEUED ATOMS (may have been compensated by later blocks):\n` +
    queue.map((q, idx) => `[${idx}] ${q.atom.slice(0, 300)}\n   Reason: ${q.failureReason.slice(0, 150)}`).join("\n\n") +
    `\n\nFor EACH atom, answer:\n` +
    `- Is the requirement ALREADY met in current files? (compensated: yes/no)\n` +
    `- If not, what remains to do? (remaining: brief)\n` +
    `Output JSON: [{"idx": 0, "compensated": bool, "remaining": "..."}, ...]`,
    "researcher",
  );

  const assessed: Array<{ idx: number; compensated: boolean; remaining: string }>
    = this.parseAssessmentJson(assessment.text);

  const stillNeeded = assessed
    .filter(a => !a.compensated)
    .map(a => ({ original: queue[a.idx], remaining: a.remaining }));

  if (stillNeeded.length === 0) {
    this.engine.streaming.phaseEnd("recovery", `All ${queue.length} compensated by later blocks`);
    return { attempted: queue.length, completed: queue.length, stillFailed: 0 };
  }

  // 2. RE-BATCH: strategist decompose et (yeni mini-vision gibi)
  const rebatchResult = await this.engine.stepWithPhase(
    visionChainId,
    `FINAL RECOVERY PHASE.\n\n` +
    `The main pipeline is done but ${stillNeeded.length} requirements are not yet implemented.\n\n` +
    `STILL NEEDED:\n${stillNeeded.map((s, i) => `${i + 1}. ${s.remaining}`).join("\n")}\n\n` +
    `Decompose these into minimal atoms (one-to-one with requirements if possible).\n` +
    `Keep scope TIGHT — we're closing gaps, not adding features.`,
    "strategist",
    "recovery_batch",
  );

  const recoveryAtoms = rebatchResult.parsed?.atoms ?? this.fallbackParseBlocks(rebatchResult.thought.output);

  // 3. EXECUTE: full QA pipeline
  let completed = 0;
  for (const ra of recoveryAtoms) {
    const ok = await this.executeAtomWithRetries(ra, "RECOVERY", visionOutput, "", {
      maxRetries: 3,
      allowRescue: false,    // No recursion in recovery
      blockIdx: -1,
      atomIdx: completed,
      visionChainId,
    });
    if (ok) completed++;
  }

  const stillFailed = recoveryAtoms.length - completed;
  this.engine.streaming.phaseEnd("recovery",
    `${completed}/${recoveryAtoms.length} recovered, ${stillFailed} still failed`);

  return { attempted: recoveryAtoms.length, completed, stillFailed };
}
```

**Pipeline caller** (reflection'dan sonra):
```typescript
// Tüm bloklar bitti, reflection yapıldı
await this.runReflection(...);

// Recovery phase
const recovery = await this.runRecoveryPhase(visionOutput, visionChain.id);
if (recovery.attempted > 0) {
  // Final reflection — recovery sonrası
  await this.runFinalReflection(visionOutput, recovery);
}
```

### 5. `src/prompts.ts` — yeni promptlar

```typescript
export const ATOM_RESCUE_SYSTEM = `Sen Stratejist'sin ama özel modda: başarısız bir atomu KURTAR.
Bir atom 3 deneme boyunca reviewer'a takıldı. Başarısızlık sebebini oku, atomu 2-3 mini-atoma böl:
- Her mini-atom: 1 dosya, 1 değişiklik, 1 test edilebilir acceptance criterion
- Başarısızlık pattern'ini TEKRARLAMA (reviewer feedback'i ciddiye al)
- Dosya yolları mutlak, line anchor'ları mümkünse satır no ile
Çıktı: atomize formatı (her mini-atom yeni paragrafta).`;

export const RECOVERY_ASSESS_SYSTEM = `Sen Araştırmacı'sın, pipeline sonu forensics modunda.
Görev: site'ın mevcut dosya durumuna bak, kuyruktaki başarısız atomların gereksinimleri gerçekten eksik mi yoksa başka bloklar farkında olmadan telafi etti mi, belirle.
- Dosya içeriklerini referans al (pre-read sağlanacak)
- Sahte "compensated" onayı verme — şüpheliyse "compensated: false" de
- Kalan iş için kısa, uygulanabilir "remaining" yaz
JSON output mandatory: [{"idx": N, "compensated": bool, "remaining": "..."}, ...]`;
```

### 6. Test

`src/orchestrator.recovery.test.ts` — Mock provider ile:
- Test 1: Rescue başarılı (mini-atomların 1'i geçer, queue'ya sadece fail olan mini girer)
- Test 2: Rescue başarısız (tüm mini-atomlar fail → tamamı queue'ya)
- Test 3: Recovery assess (mock assesment `compensated: true` döner → o atom skip)
- Test 4: Recovery full flow (2 queued → 1 compensated + 1 re-execute → pipeline metadata updates)
- Test 5: Sonsuz döngü yok (rescue içinde allowRescue=false ile recursion korunur)

## Risk Kontrolleri

1. **Sonsuz döngü önleme**: `rescueAtom` içinde `allowRescue: false` — 1 kademe kuralı
2. **Token budget**: `budget.perSession: 200000` zaten var; aşılırsa mevcut `BudgetExceededError` pipeline'ı durdurur
3. **QA disiplini**: Rescue + recovery atomları da aynı `reviewer_gate`'den geçer (atlanamaz)
4. **Rollback korumalı**: Her atom öncesi `rollback.createPoint()` — rescue fail'de diskteki çöpleri siler
5. **Observability**: `streaming.phaseStart/End` + watchdog log'u Recovery fazını net gösterecek

## Neyi Değiştirmiyoruz

- Visioner, Researcher, primary Strategist davranışları aynı kalır
- Reviewer gate prompt'u değişmez (zaten sıkı ve doğru çalışıyor)
- Rate limiter, state machine, memory, git commit — hiçbiri etkilenmiyor
- Mock-first test disipline korunur

## Katman 0: Transport Resilience Patch (öncelik #1)

`src/engine.ts` — `callLLM` başında transient network hatalarını yakala:

```typescript
private isTransientNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|terminated|network timeout|EAI_AGAIN/i.test(msg);
}

async callLLM(systemPrompt: string, userPrompt: string, layer: Layer, ...): Promise<...> {
  const MAX_NET_RETRIES = 3;
  const backoffs = [5000, 15000, 45000];
  
  for (let attempt = 0; attempt < MAX_NET_RETRIES; attempt++) {
    try {
      // ... existing LLM call logic
      return result;
    } catch (err) {
      if (this.isTransientNetworkError(err) && attempt < MAX_NET_RETRIES - 1) {
        const wait = backoffs[attempt];
        this.streaming.warning(
          `[net] Transient ${err instanceof Error ? err.message.slice(0, 40) : "error"} — backoff ${wait/1000}s (attempt ${attempt + 1}/${MAX_NET_RETRIES})`
        );
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}
```

**Neden engine seviyesinde**: Orchestrator'un farklı noktalarında (primary atom, re-atom, rescue atom, recovery atom, researcher, strategist) aynı try/catch'i tekrarlamamak için. Tek yerde tut, her çağrı korunur.

## Implementation Checklist

### Katman 0 (öncelik — bunsuz pipeline crash'a açık)
- [ ] `engine.ts`: `isTransientNetworkError` helper
- [ ] `engine.ts`: `callLLM` içinde 3-attempt exponential backoff
- [ ] Unit test: mock provider ECONNRESET fırlatır → 3 retry → başarı veya throw
- [ ] `orchestrator.ts`: global uncaught exception handler (`process.on('uncaughtException')` + `process.on('unhandledRejection')`) — son güvenlik ağı, state.json'a yaz, graceful shutdown

### Katman 1-3
- [ ] `types.ts`: `FailedAtom`, `ForemanState.recoveryQueue?`
- [ ] `state.ts`: `pushRecovery`, `getRecoveryQueue`, `clearRecoveryQueue` metodları
- [ ] `orchestrator.ts`: `executeAtomWithRetries` helper extract (primary + rescue + recovery'de ortak)
- [ ] `orchestrator.ts`: `rescueAtom` method
- [ ] `orchestrator.ts`: `runRecoveryPhase` method
- [ ] `orchestrator.ts`: primary retry loop — skip → rescue + queue
- [ ] `orchestrator.ts`: re_decompose koşul gevşetme
- [ ] `orchestrator.ts`: pipeline tail'de `runRecoveryPhase` çağrısı + final reflection
- [ ] `prompts.ts`: `ATOM_RESCUE_SYSTEM`, `RECOVERY_ASSESS_SYSTEM`
- [ ] Unit tests (5 case)
- [ ] `tsc --noEmit` 0 yeni hata
- [ ] Mock provider smoke test (rescue + recovery flow tam geçmeli)
- [ ] Canlı smoke: dassystems benzeri task ile tekrar forge, skip 0 olmalı

## Sonraki Adım

Bu canlı pipeline bittikten sonra yapılacak. Şu ana kadar üretilenler korunacak.
Branch: `fix/forge-atom-rescue-and-recovery` — main'den açılır, fix/forge-pipeline-hardening ile çakışmaz.

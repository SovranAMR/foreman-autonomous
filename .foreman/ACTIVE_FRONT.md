# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B04
active_atom: P05-B04-A01
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 429/1000
phase_progress: 25/100
block_progress: 0/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-19

## Tek seferlik bootstrap — program atomu değildir

İlk automation koşusunda src/kimi-provider.ts veya MessagingGateway hâlâ ana model
olarak kimi-k2.6 kullanıyorsa Kimi K3'e tek bounded değişiklikle geçir:

- ana model kimi-k3;
- resmi K3 request parametreleri;
- K2.x thinking alanını K3'e gönderme;
- provider-aware model seçimi;
- odaklı test.

Bu bootstrap için phase/block üretme. Kanıtlı PASS sonrası doğrudan P01-B01-A01'e dön.
Zaten tamamlanmışsa tekrar yapma.

## Aktif atom

P05-B04-A01 — Shell ve process lifecycle: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P05-B03 block gate sealed; measure shell/process lifecycle baseline from sealed edit engine artifacts.
target: Create versioned worker shell/process lifecycle baseline fixture with documented FAIL gaps linked to P05-B03 handoff.
hypothesis: Baseline fixture loads, validates against P05-B03 block gate source artifacts, and runs probe matrix with measurable gaps.
acceptance: Baseline fixture versioned; probe matrix executes; sourceBlockGate references P05-B03-A10; handoff entry atom P05-B04-A01.
commands: npx tsx --test src/forge-p05-worker-shell-process*.test.ts
blast_radius: src/forge-p05-worker-shell-process.ts
rollback: P05-B04-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B03-A10
last_commit: PENDING
tests: PASS — forge-p05-worker-edit-engine-block-gate.test.ts (9/9), guard (9/9), integration (7/7), property-fuzz (7/7), evidence (5/5), failure-recovery (5/5), boundary (7/7), production (5/5), baseline (8/8), contract (8/8) — 70 total
evidence: runWorkerEditEngineBlockGate + validateForgeWorkerEditEngineBlockGate; 10/10 atom seals, regression/guard PASS, handoff PASS→P05-B04 entry=P05-B04-A01
next: P05-B04-A01

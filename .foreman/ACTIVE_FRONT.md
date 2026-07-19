# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B09
active_atom: P04-B09-A09
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 388/1000
phase_progress: 86/100
block_progress: 8/10
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

P04-B09-A09 — Research-to-worker handoff: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P04-B09-A08 PASS; regression gate wired with property/fuzz and guard foundation.
target: Extend guard controls for adversarial, performance, cost and safety on research-to-worker handoff slice.
hypothesis: A08 guard foundation enables A09 dedicated guard verification with adversarial scenario rejection.
acceptance: Guard passes on canonical record; adversarial tamper rejected; perf/cost/safety within bounds.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts
rollback: P04-B09-A09 guard değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Guard blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A08
last_commit: 260320b
tests: PASS — forge-p04-researcher-research-to-worker-handoff*.test.ts (50/50); regression 8/8; propertyFuzz wired; guard adversarial=3/3
evidence: runResearcherResearchToWorkerHandoffForgeRegression + runForgeResearcherResearchToWorkerHandoffRegressionGate + validateForgeResearcherResearchToWorkerHandoffGuard
next: P04-B09-A09

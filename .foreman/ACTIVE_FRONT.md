# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 177/1000
phase_progress: 76/100
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

P02-B08-A09 — Vision scoring adversarial, performance, cost and safety kontrolünü geçir.

objective: P02-B08-A08 regression gate PASS; extend guard controls with dedicated adversarial/perf/cost/safety test suite.
target: validateForgeVisionerScoringGuard and forge-p02-visioner-scoring.guard.test.ts.
hypothesis: A08 regression gate guard foundation enables A09 guard slice without probe matrix refactor.
acceptance: forge-p02-visioner-scoring.guard.test.ts; guard integration with orchestrator verifyForgeVisionerScoringGuard.
commands: npx tsx --test src/forge-p02-visioner-scoring.guard.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A09 guard test değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: guard slice requires scoring contract refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A08
last_commit: 8602240
tests: PASS — forge-p02-visioner-scoring.test.ts (31/31), forge-p02-visioner-scoring.property-fuzz.test.ts (5/5), forge-pipeline-regression.integration.test.ts scoring slice (5/5)
evidence: detectVisionerScoringProbeRegression wired; runForgeVisionerScoringRegressionGate 23/23 aligned; orchestrator verifyForgeVisionerScoringRegression emits visioner_scoring_regression
next: P02-B08-A09

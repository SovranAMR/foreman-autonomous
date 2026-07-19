# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 87/1000
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

P01-B09-A09 — Orchestrator seam ve modülerleşme: adversarial, performance, cost ve safety kontrolünü geçir.

objective: A08 regression integration sealed; forge-orchestrator-seam guard controls on production slice.
target: validateForgeOrchestratorSeamGuard adversarial/perf/cost/safety gate wired to orchestrator verifyForgeOrchestratorSeamGuard.
hypothesis: A08 guard foundation + sealed B08 handoff sufficient for standalone guard gate.
acceptance: guard gate pass; adversarial scenarios rejected; perf/cost/safety within controls.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts
blast_radius: forge-orchestrator-seam.ts, forge-orchestrator-seam.probe.ts, orchestrator.ts
rollback: A09 guard değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A08 regression invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A08
last_commit: PENDING
tests: PASS — forge-orchestrator-seam*.test.ts (28/28); forge-pipeline-regression.integration.test.ts (5/5 A08); productionSlice unexpected=0; propertyFuzz sealed; guard adversarial=3/3
evidence: runForgeOrchestratorSeamRegressionGate; runOrchestratorSeamProbesWithRecord; verifyForgeOrchestratorSeamRegression in forge-orchestrator-seam.probe.ts + orchestrator.ts
next: P01-B09-A09

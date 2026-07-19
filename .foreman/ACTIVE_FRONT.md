# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 147/1000
phase_progress: 47/100
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

P02-B05-A09 — Research trigger belirleme: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P02-B05-A08 regression integration sealed; guard integration slice next.
target: Wire visioner research trigger guard controls into Forge guard integration harness.
hypothesis: validateForgeVisionerResearchTriggerGuard and runVisionerResearchTriggerAdversarialGuardChecks provide stable guard entry points.
acceptance: guard integration test passes; adversarial scenarios rejected in record gate.
commands: npx tsx --test src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-pipeline-regression.integration.test.ts, src/forge-p02-visioner-research-trigger*
rollback: P02-B05-A09 guard integration değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: guard harness requires unrelated orchestrator refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A08
last_commit: bc65313
tests: PASS — forge-pipeline-regression.integration.test.ts P02-B05-A08 (5/5); forge-p02-visioner-research-trigger.test.ts (24/24); forge-p02-visioner-research-trigger.property-fuzz.test.ts (5/5)
evidence: runForgeVisionerResearchTriggerRegressionGate 23/23 probes; propertyFuzz properties=8/8 contractFuzz rejected=72/72 runFuzz rejected=3/3; guard adversarial=3/3; FORGE_VISIONER_RESEARCH_TRIGGER_VERSION 1.0.0-a08
next: P02-B05-A09

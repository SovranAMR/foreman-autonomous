# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B06
active_atom: P02-B06-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 158/1000
phase_progress: 57/100
block_progress: 9/10
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

P02-B06-A10 — Uncertainty block gate: seal B06 deliverables and B07 handoff.

objective: P02-B06-A09 guard controls sealed; block gate next.
target: Implement runVisionerUncertaintyBlockGate with atom seals, regression/guard evidence, and B07 handoff contract.
hypothesis: grounding/research-trigger block gate pattern ports to uncertainty without orchestrator seam changes.
acceptance: block-gate.test.ts PASS; orchestrator verifyForgeVisionerUncertaintyBlockGate emits verification; handoff valid.
commands: npx tsx --test src/forge-p02-visioner-uncertainty-block-gate.test.ts
blast_radius: src/forge-p02-visioner-uncertainty*, src/forge-p02-visioner-uncertainty.probe.ts
rollback: P02-B06-A10 block gate slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: block gate requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B06-A09
last_commit: 8fa7b61
tests: PASS — forge-p02-visioner-uncertainty.guard.test.ts (8/8); forge-pipeline-regression.integration.test.ts (87/87)
evidence: validateForgeVisionerUncertaintyGuard adversarial=3/3 rejected; runForgeVisionerUncertaintyRegressionGate guard PASS with perf/cost metrics; orchestrator verifyForgeVisionerUncertaintyGuard emits visioner_uncertainty_guard verification
next: P02-B06-A10

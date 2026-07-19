# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B10
active_atom: P02-B10-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 198/1000
phase_progress: 97/100
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

P02-B10-A10 — Vizyoner phase gate: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P02-B10-A09 PASS; seal P02-B10 block gate evidence with regression+guard PASS and P03 handoff contract.
target: runForgeVisionerPhaseGateBlockGate, verifyForgeP02VisionerPhaseGateBlockGate.
hypothesis: block gate validates A01–A09 deliverables, guard/regression gates, and P03 entry handoff.
acceptance: block gate PASS; handoff valid; orchestrator verification emits visioner_phase_gate_block_gate.
commands: npx tsx --test src/forge-p02-visioner-phase-gate-block-gate.test.ts src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-p02-visioner-phase-gate.ts, src/forge-p02-visioner-phase-gate.probe.ts, src/orchestrator.ts
rollback: P02-B10-A10 block gate slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Block gate cannot align with canonical matrix after A09 slice ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B10-A09
last_commit: b2add83
tests: PASS — forge-p02-visioner-phase-gate.guard.test.ts (8/8); forge-pipeline-regression.integration.test.ts P02-B10-A09 (3/3); 114/114 targeted
evidence: validateForgeVisionerPhaseGateGuard; verifyForgeP02VisionerPhaseGateGuard; adversarial=3/3 rejected; regression gate guard metrics; handoff=P02-B10-A09→A10
next: P02-B10-A10

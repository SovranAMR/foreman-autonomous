# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B10
active_atom: P02-B10-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 196/1000
phase_progress: 95/100
block_progress: 7/10
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

P02-B10-A08 — Vizyoner phase gate: Forge entegrasyonu ile regression testini tamamla.

objective: P02-B10-A07 PASS; integrate visioner phase gate regression with Forge orchestrator verification.
target: forge-p02-visioner-phase-gate regression slice, orchestrator verifyForgeP02VisionerPhaseGate.
hypothesis: orchestrator regression gate detects probe alignment drift and preserves canonical matrix.
acceptance: regression gate PASS; zero unexpected mismatches; prior/current record comparison aligned.
commands: npx tsx --test src/forge-p02-visioner-phase-gate.test.ts src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-p02-visioner-phase-gate.ts, src/forge-p02-visioner-phase-gate.probe.ts, src/orchestrator.ts
rollback: P02-B10-A08 regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Orchestrator regression cannot align after A07 slice ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B10-A07
last_commit: 8e40bc7
tests: PASS — forge-p02-visioner-phase-gate.test.ts (26/26); property-fuzz (5/5); baseline (3/3)
evidence: runVisionerPhaseGatePropertyChecks; runVisionerPhaseGateFuzzValidation; runVisionerPhaseGateRunRecordFuzzValidation; 8/8 structural properties; 72/72 fixture fuzz rejected; 8/8 run-record mutations rejected; handoff=P02-B10-A07→A08
next: P02-B10-A08

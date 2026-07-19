# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B10
active_atom: P02-B10-A02
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 191/1000
phase_progress: 90/100
block_progress: 2/10
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

P02-B10-A02 — Vizyoner phase gate: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P02-B10-A01 PASS; define typed visioner phase gate contract with measurable acceptance probes.
target: forge-p02-visioner-phase-gate contract helpers, coverage validation and contract test suite.
hypothesis: typed contract declares 23 probes across eight categories with one documented orchestrator gap.
acceptance: contract coverage validates; fixture aligns; probe criteria wired from contract source of truth.
commands: npx tsx --test src/forge-p02-visioner-phase-gate.test.ts
blast_radius: src/forge-p02-visioner-phase-gate.ts, src/forge-p02-visioner-phase-gate.test.ts, src/fixtures/forge-visioner-phase-gate-v1.json
rollback: P02-B10-A02 contract helper and test değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Contract cannot align with A01 baseline fixture ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B10-A02
last_commit: 95dbb48
tests: PASS — forge-p02-visioner-phase-gate.test.ts (8/8); baseline regression (3/3)
evidence: getActiveVisionerPhaseGateContract; validateVisionerPhaseGateContractCoverage; knownGap=vpg.orchestrator_phase_gate_runner; handoff=P02-B10-A02→A03
next: P02-B10-A03

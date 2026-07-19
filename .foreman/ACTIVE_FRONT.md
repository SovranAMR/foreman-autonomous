# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B07
active_atom: P02-B07-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 159/1000
phase_progress: 58/100
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

P02-B07-A01 — Alternative vision baseline: measure current behavior and create failing baseline fixture.

objective: P02-B06 block gate sealed; B07 baseline next.
target: Measure alternative vision generation behavior and create forge-visioner-alternative-v1 baseline fixture linked to P02-B06 block gate handoff.
hypothesis: uncertainty block gate handoff provides sealed probe matrix anchor for alternative vision baseline.
acceptance: baseline.test.ts PASS; fixture aligned to B06 handoff contract.
commands: npx tsx --test src/forge-p02-visioner-alternative-baseline.test.ts
blast_radius: src/forge-p02-visioner-alternative*, src/fixtures/forge-visioner-alternative-v1.json
rollback: P02-B07-A01 baseline slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: baseline requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B06-A10
last_commit: pending
tests: PASS — forge-p02-visioner-uncertainty-block-gate.test.ts (6/6); forge-pipeline-regression.integration.test.ts
evidence: runVisionerUncertaintyBlockGate seals 10/10 atom seals; handoff=PASS→P02-B07; orchestrator verifyForgeVisionerUncertaintyBlockGate emits visioner_uncertainty_block_gate verification
next: P02-B07-A01

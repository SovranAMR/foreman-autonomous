# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B10
active_atom: P02-B10-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 195/1000
phase_progress: 94/100
block_progress: 6/10
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

P02-B10-A07 — Vizyoner phase gate: unit, property ve fuzz doğrulamasını ekle.

objective: P02-B10-A06 PASS; add unit, property and fuzz validation for visioner phase gate.
target: forge-p02-visioner-phase-gate property/fuzz slice, structural invariants.
hypothesis: property and fuzz gates reject tampered run records and contract drift.
acceptance: property checks pass; fuzz mutations rejected; zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-visioner-phase-gate.test.ts src/forge-p02-visioner-phase-gate.property-fuzz.test.ts
blast_radius: src/forge-p02-visioner-phase-gate.ts, src/forge-p02-visioner-phase-gate.probe.ts, src/forge-p02-visioner-phase-gate.property-fuzz.test.ts
rollback: P02-B10-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Run record fuzz cannot align after A06 slice ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B10-A06
last_commit: 4c23a35
tests: PASS — forge-p02-visioner-phase-gate.test.ts (26/26); baseline regression (3/3)
evidence: validateVisionerPhaseGateFailureRecoveryRunRecord; runVisionerPhaseGateFailureRecoverySliceWithRecord; runVisionerPhaseGateProbesWithRecord; 7/7 failure/recovery evidence aligned; handoff=P02-B10-A06→A07
next: P02-B10-A07

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B06
active_atom: P02-B06-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 155/1000
phase_progress: 54/100
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

P02-B06-A07 — Uncertainty ve clarification policy: unit, property ve fuzz doğrulamasını ekle.

objective: P02-B06-A06 evidence slice sealed; property/fuzz validation next.
target: Add unit, property and fuzz validation for visioner uncertainty run records.
hypothesis: validateVisionerUncertaintyFailureRecoveryRunRecord from A06 enables property/fuzz slice without record regressions.
acceptance: property/fuzz gates pass; run record tamper rejection verified; zero unexpected mismatches preserved.
commands: npx tsx --test src/forge-p02-visioner-uncertainty.property-fuzz.test.ts
blast_radius: src/forge-p02-visioner-uncertainty*, src/orchestrator.ts
rollback: P02-B06-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: property/fuzz requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B06-A06
last_commit: pending
tests: PASS — forge-p02-visioner-uncertainty.test.ts (24/24); baseline (3/3)
evidence: buildVisionerUncertaintyRunRecord + validateVisionerUncertaintyFailureRecoveryRunRecord exported; runVisionerUncertaintyFailureRecoverySliceWithRecord + runVisionerUncertaintyProbesWithRecord; 6 failure/recovery probes evidence/telemetry/provenance; harness 1.0.0-a09; zero unexpected mismatches
next: P02-B06-A07

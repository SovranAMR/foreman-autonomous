# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 185/1000
phase_progress: 84/100
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

P02-B09-A07 — Kullanıcı approval ve steering: unit, property ve fuzz doğrulamasını ekle.

objective: P02-B09-A06 PASS; implement property/fuzz validation for approval run record with runVisionerApprovalPropertyChecks gate.
target: forge-p02-visioner-approval property/fuzz slice with run record fuzz validation.
hypothesis: property and fuzz gates reject tampered approval run records while accepting valid baseline.
acceptance: forge-p02-visioner-approval.property-fuzz.test.ts gates pass.
commands: npx tsx --test src/forge-p02-visioner-approval.property-fuzz.test.ts
blast_radius: src/forge-p02-visioner-approval*
rollback: P02-B09-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: property/fuzz validation cannot align ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A06
last_commit: pending
tests: PASS — forge-p02-visioner-approval.test.ts (26/26), forge-p02-visioner-approval-baseline.test.ts (3/3)
evidence: validateVisionerApprovalFailureRecoveryRunRecord; runVisionerApprovalFailureRecoverySliceWithRecord; failureRecovery evidence=6 telemetry=6 mismatches=0
next: P02-B09-A07

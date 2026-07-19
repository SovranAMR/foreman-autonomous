# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A06
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 184/1000
phase_progress: 83/100
block_progress: 5/10
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

P02-B09-A06 — Kullanıcı approval ve steering: evidence, telemetry ve provenance kaydını ekle.

objective: P02-B09-A05 PASS; implement evidence/telemetry run record for failure/recovery slice with validateVisionerApprovalFailureRecoveryRunRecord gate.
target: forge-p02-visioner-approval evidence slice with run record builder and A06 validation gate.
hypothesis: failure/recovery slice run record captures disposition, criterion and aligned probe outcomes.
acceptance: forge-p02-visioner-approval.test.ts evidence slice gates pass.
commands: npx tsx --test src/forge-p02-visioner-approval.test.ts
blast_radius: src/forge-p02-visioner-approval*
rollback: P02-B09-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: run record validation cannot align ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A05
last_commit: b5c041a
tests: PASS — forge-p02-visioner-approval.test.ts (24/24), forge-p02-visioner-approval-baseline.test.ts (3/3)
evidence: validateVisionerApprovalFailureRecoveryProbeMatrix; runVisionerApprovalFailureRecoverySlice; failureRecovery passAligned=6 gapAligned=0 unexpectedMismatches=0
next: P02-B09-A06

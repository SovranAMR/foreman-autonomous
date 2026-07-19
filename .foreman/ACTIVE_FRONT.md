# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A05
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 183/1000
phase_progress: 82/100
block_progress: 4/10
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

P02-B09-A05 — Kullanıcı approval ve steering: failure, recovery ve NO-GO yollarını uygula.

objective: P02-B09-A04 PASS; implement failure_path, recovery_path and nogo_path probe slice with zero unexpected mismatches.
target: forge-p02-visioner-approval failure/recovery slice with validateVisionerApprovalFailureRecoveryProbeMatrix gate.
hypothesis: six failure/recovery/NO-GO probes align PASS with documented gaps preserved.
acceptance: forge-p02-visioner-approval.test.ts failure/recovery slice gates pass.
commands: npx tsx --test src/forge-p02-visioner-approval.test.ts
blast_radius: src/forge-p02-visioner-approval*
rollback: P02-B09-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: failure/recovery probes cannot align ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A04
last_commit: PENDING
tests: PASS — forge-p02-visioner-approval.test.ts (18/18), forge-p02-visioner-approval-baseline.test.ts (3/3)
evidence: validateVisionerApprovalBoundaryProbeMatrix; runVisionerApprovalBoundarySlice; boundary passAligned=6 gapAligned=0 unexpectedMismatches=0; full matrix 23/23 aligned
next: P02-B09-A05

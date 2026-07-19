# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B06
active_atom: P02-B06-A06
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 154/1000
phase_progress: 53/100
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

P02-B06-A06 — Uncertainty ve clarification policy: evidence, telemetry ve provenance kaydını ekle.

objective: P02-B06-A05 failure/recovery slice sealed; evidence slice next.
target: Complete evidence, telemetry and provenance run record for failure/recovery probe matrix.
hypothesis: validateVisionerUncertaintyFailureRecoveryProbeMatrix from A05 enables evidence slice without probe regressions.
acceptance: failure/recovery run record validates; zero unexpected mismatches; documented FAIL gaps preserved.
commands: npx tsx --test src/forge-p02-visioner-uncertainty.test.ts
blast_radius: src/forge-p02-visioner-uncertainty*, src/orchestrator.ts
rollback: P02-B06-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: evidence requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B06-A05
last_commit: pending
tests: PASS — forge-p02-visioner-uncertainty.test.ts (21/21); baseline (3/3)
evidence: validateVisionerUncertaintyFailureRecoveryProbeMatrix + runVisionerUncertaintyFailureRecoverySlice exported; 6 failure/recovery/NO-GO probes all PASS; probe matrix zero unexpected mismatches; documented FAIL gaps preserved
next: P02-B06-A06

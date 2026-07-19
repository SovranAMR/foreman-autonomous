# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B03
active_atom: P02-B03-A06
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 124/1000
phase_progress: 24/100
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

P02-B03-A06 — Ürün vizyonu sentezi: evidence, telemetry ve provenance kaydını ekle.

objective: P02-B03-A05 failure/recovery slice sealed; B03 evidence/telemetry slice next.
target: Complete evidence run record and provenance wiring for failure/recovery probe slice.
hypothesis: A05 failure/recovery gate provides stable anchor for evidence/telemetry probes.
acceptance: evidence slice executes contract-wired probes with zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-synthesis.ts
rollback: P02-B03-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A05
last_commit: 90644ed
tests: PASS — forge-p02-visioner-synthesis-baseline.test.ts (3/3); forge-p02-visioner-synthesis.test.ts (18/18); forge-p02-visioner-synthesis*.test.ts (21/21); forge-p02-*.test.ts (107/107)
evidence: runVisionerSynthesisFailureRecoverySlice atom=P02-B03-A05 failureRecoveryProbeCount=6 matrixValid=true unexpectedMismatches=0 passAligned=5 gapAligned=1; validateVisionerSynthesisFailureRecoveryProbeMatrix valid=true; knownGaps preserved vsyn.structured_synthesis_recovery
next: P02-B03-A06

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B03
active_atom: P02-B03-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 125/1000
phase_progress: 25/100
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

P02-B03-A07 — Ürün vizyonu sentezi: unit, property ve fuzz doğrulamasını ekle.

objective: P02-B03-A06 evidence/telemetry slice sealed; B03 property/fuzz slice next.
target: Add unit, property and fuzz validation gates for visioner synthesis evidence slice.
hypothesis: A06 evidence run record provides stable anchor for property/fuzz probes.
acceptance: property/fuzz slice validates run record integrity with zero unexpected rejections.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-synthesis.ts
rollback: P02-B03-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A06
last_commit: 8e92ab8
tests: PASS — forge-p02-visioner-synthesis-baseline.test.ts (3/3); forge-p02-visioner-synthesis.test.ts (21/21); forge-p02-visioner-synthesis*.test.ts (24/24); forge-p02-*.test.ts (110/110)
evidence: runVisionerSynthesisFailureRecoverySliceWithRecord atom=P02-B03-A06 failureRecoveryProbeCount=6 matrixValid=true unexpectedMismatches=0 passAligned=5 gapAligned=1; validateVisionerSynthesisFailureRecoveryRunRecord valid=true; knownGaps preserved vsyn.structured_synthesis_recovery
next: P02-B03-A07

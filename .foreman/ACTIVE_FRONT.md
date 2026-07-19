# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B03
active_atom: P02-B03-A05
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 123/1000
phase_progress: 23/100
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

P02-B03-A05 — Ürün vizyonu sentezi: failure, recovery ve NO-GO yollarını uygula.

objective: P02-B03-A04 boundary slice sealed; B03 failure/recovery slice next.
target: Complete failure_path, recovery_path and nogo_path probe slice with zero unexpected mismatches.
hypothesis: A04 boundary gate provides stable anchor for failure/recovery/NO-GO probes.
acceptance: failure/recovery slice executes contract-wired probes with zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-synthesis.ts
rollback: P02-B03-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A04
last_commit: 67f6532
tests: PASS — forge-p02-visioner-synthesis-baseline.test.ts (3/3); forge-p02-visioner-synthesis.test.ts (15/15); forge-p02-visioner-synthesis*.test.ts (18/18); forge-p02-*.test.ts (104/104)
evidence: runVisionerSynthesisBoundarySlice atom=P02-B03-A04 boundaryProbeCount=6 matrixValid=true unexpectedMismatches=0 passAligned=6 gapAligned=0; validateVisionerSynthesisBoundaryProbeMatrix valid=true; knownGaps preserved vsyn.structured_synthesis_recovery
next: P02-B03-A05

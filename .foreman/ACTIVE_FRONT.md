# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B03
active_atom: P02-B03-A04
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 122/1000
phase_progress: 22/100
block_progress: 3/10
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

P02-B03-A04 — Ürün vizyonu sentezi: boundary ve edge-case davranışlarını tamamla.

objective: P02-B03-A03 production slice sealed; B03 boundary slice next.
target: Complete boundary-category probe slice with zero unexpected mismatches.
hypothesis: A03 matrix gate provides stable anchor for boundary edge-case probes.
acceptance: boundary slice executes contract-wired probes with zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-synthesis.ts
rollback: P02-B03-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A03
last_commit: 1aabc44
tests: PASS — forge-p02-visioner-synthesis-baseline.test.ts (3/3); forge-p02-visioner-synthesis.test.ts (10/10); forge-p02-visioner-synthesis*.test.ts (13/13); forge-p02-*.test.ts (99/99)
evidence: runVisionerSynthesisProductionSlice atom=P02-B03-A03 matrixValid=true unexpectedMismatches=0 passAligned=22 gapAligned=1; validateVisionerSynthesisProbeMatrix valid=true; knownGaps=1 vsyn.structured_synthesis_recovery
next: P02-B03-A04

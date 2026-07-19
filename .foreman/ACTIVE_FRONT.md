# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B03
active_atom: P02-B03-A02
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 120/1000
phase_progress: 20/100
block_progress: 1/10
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

P02-B03-A02 — Ürün vizyonu sentezi: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P02-B03-A01 baseline sealed; B03 typed contract next.
target: Define measurable acceptance criteria via typed contract for product vision synthesis probes.
hypothesis: A01 baseline probe matrix provides stable anchor for typed synthesis contract.
acceptance: contract declares all synthesis categories; fixture ↔ contract aligned; one documented FAIL gap preserved.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-synthesis.ts
rollback: P02-B03-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A01
last_commit: 4fa30b1
tests: PASS — forge-p02-visioner-synthesis-baseline.test.ts (3/3); forge-p02-visioner-synthesis*.test.ts (3/3); forge-p02-*.test.ts (89/89)
evidence: loadVisionerSynthesisBaseline atom=P02-B03-A01 probes=23/23; runVisionerSynthesisProbes aligned=23/23 knownGaps=1 vsyn.structured_synthesis_recovery; validateVisionerSynthesisBaseline links FORGE_P02_B02_TO_B03_HANDOFF_V1 sourceBlockGate=P02-B02-A10
next: P02-B03-A02

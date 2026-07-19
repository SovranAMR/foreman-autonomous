# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A02
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 130/1000
phase_progress: 30/100
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

P02-B04-A02 — Repo ve kullanıcı bağlamı grounding: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P02-B04-A01 baseline sealed; typed contract coverage next.
target: Declare measurable grounding contract probes aligned to baseline fixture matrix.
hypothesis: A01 baseline matrix provides stable probe ids for A02 contract declaration.
acceptance: contract declares all categories, coverage validates, zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-visioner-grounding*.test.ts
blast_radius: src/forge-p02-visioner-grounding.ts
rollback: P02-B04-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: contract cannot align to baseline without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A01
last_commit: c1b1ed7
tests: PASS — forge-p02-visioner-grounding-baseline.test.ts (3/3); forge-p02-*.test.ts (132/132)
evidence: runVisionerGroundingProbes aligned=22/23 knownGap=vgrd.structured_grounding_recovery handoff→P02-B03-A10; harnessVersion=1.0.0-a01
next: P02-B04-A02

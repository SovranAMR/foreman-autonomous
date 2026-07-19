# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B02
active_atom: P02-B02-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 111/1000
phase_progress: 11/100
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

P02-B02-A02 — Constraint ve non-goal çıkarımı: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P02-B02-A01 baseline sealed; B02 contract A02 next.
target: typed constraint/non-goal contract with measurable probes aligned to baseline fixture.
hypothesis: sealed B02 baseline probe matrix provides stable source for typed contract acceptance.
acceptance: contract loads; fixture alignment probes pass; coverage declares all constraint categories.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-constraint.ts
rollback: P02-B02-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: contract cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B02-A01
last_commit: PENDING
tests: PASS — forge-p02-visioner-constraint-baseline.test.ts (3/3); forge-p02-visioner-constraint*.test.ts (3/3); forge-p02-visioner-intent*.test.ts (43/43)
evidence: loadVisionerConstraintBaseline, runVisionerConstraintProbes, validateVisionerConstraintBaseline; baseline=23 probes FAIL gap=vcon.structured_constraint_recovery handoff=P02-B01→B02
next: P02-B02-A02

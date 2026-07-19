# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B02
active_atom: P02-B02-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 112/1000
phase_progress: 12/100
block_progress: 2/10
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

P02-B02-A04 — Constraint ve non-goal çıkarımı: boundary ve edge-case davranışlarını tamamla.

objective: P02-B02-A03 production slice sealed; B02 boundary slice A04 next.
target: boundary and edge-case behavior for constraint/non-goal extraction with contract probes.
hypothesis: typed A03 extraction provides stable anchor for boundary hardening.
acceptance: boundary slice runs; fixture alignment holds; zero unexpected PASS mismatches.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-constraint.ts
rollback: P02-B02-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B02-A03
last_commit: PENDING
tests: PASS — forge-p02-visioner-constraint.test.ts (10/10); forge-p02-visioner-constraint*.test.ts (13/13); forge-p02-visioner-intent*.test.ts (43/43)
evidence: extractVisionerConstraints, buildVisionConstraintSummary, validateVisionerConstraintProbeMatrix, runVisionerConstraintProductionSlice; matrix=22 pass + 1 gap (vcon.structured_constraint_recovery)
next: P02-B02-A04

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B02
active_atom: P02-B02-A05
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 113/1000
phase_progress: 13/100
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

P02-B02-A05 — Constraint ve non-goal çıkarımı: failure, recovery ve NO-GO yollarını uygula.

objective: P02-B02-A04 boundary slice sealed; B02 failure/recovery slice A05 next.
target: failure, recovery and NO-GO paths for constraint/non-goal extraction with contract probes.
hypothesis: typed A04 boundary provides stable anchor for failure/recovery hardening.
acceptance: failure/recovery slice runs; fixture alignment holds; zero unexpected PASS mismatches.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-constraint.ts
rollback: P02-B02-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B02-A04
last_commit: PENDING
tests: PASS — forge-p02-visioner-constraint.test.ts (18/18); forge-p02-visioner-constraint*.test.ts (18/18); forge-p02-visioner-intent*.test.ts (43/43)
evidence: assessVisionerConstraintInputBoundary, validateVisionerConstraintBoundaryProbeMatrix, runVisionerConstraintBoundarySlice; boundary=6 pass; matrix=22 pass + 1 gap (vcon.structured_constraint_recovery)
next: P02-B02-A05

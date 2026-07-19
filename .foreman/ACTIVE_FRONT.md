# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B02
active_atom: P02-B02-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 115/1000
phase_progress: 15/100
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

P02-B02-A07 — Constraint ve non-goal çıkarımı: unit, property ve fuzz doğrulamasını ekle.

objective: P02-B02-A06 evidence slice sealed; B02 property/fuzz slice A07 next.
target: structural property checks and fuzz validation for constraint run records and contract.
hypothesis: typed A06 run record provides stable anchor for property/fuzz gates.
acceptance: property checks pass; fuzz mutations rejected; zero unexpected validation gaps.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-constraint.ts
rollback: P02-B02-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B02-A06
last_commit: PENDING
tests: PASS — forge-p02-visioner-constraint.test.ts (24/24); forge-p02-visioner-constraint*.test.ts (24/24); forge-p02-visioner-intent*.test.ts (43/43)
evidence: validateVisionerConstraintFailureRecoveryRunRecord, runVisionerConstraintFailureRecoverySliceWithRecord; failure/recovery=6 probes evidence+telemetry+provenance; harnessVersion=1.0.0-a06; matrix unexpectedMismatches=0
next: P02-B02-A07

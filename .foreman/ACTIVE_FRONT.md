# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B02
active_atom: P02-B02-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 116/1000
phase_progress: 16/100
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

P02-B02-A08 — Constraint ve non-goal çıkarımı: Forge entegrasyonu ile regression testini tamamla.

objective: P02-B02-A07 property/fuzz slice sealed; B02 regression slice A08 next.
target: Forge integration regression gate for visioner constraint probe matrix and run records.
hypothesis: typed A07 property/fuzz gates provide stable anchor for regression detection.
acceptance: regression gate passes; probe alignment holds; zero unexpected PASS mismatches.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-constraint.ts
rollback: P02-B02-A08 regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B02-A07
last_commit: PENDING
tests: PASS — forge-p02-visioner-constraint*.test.ts (29/29); forge-p02-visioner-intent*.test.ts (43/43); forge-p02-*.test.ts (72/72)
evidence: runVisionerConstraintPropertyChecks (8/8); runVisionerConstraintFuzzValidation rejected=24/24; runVisionerConstraintRunRecordFuzzValidation mutationsRejected=5+3; harnessVersion=1.0.0-a07
next: P02-B02-A08

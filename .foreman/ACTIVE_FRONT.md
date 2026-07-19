# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B07
active_atom: P02-B07-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 165/1000
phase_progress: 64/100
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

P02-B07-A07 — Alternative vision production slice: unit, property and fuzz validation.

objective: P02-B07-A06 evidence slice PASS; property/fuzz next.
target: Add unit, property and fuzz validation for alternative vision evidence run record.
hypothesis: run record contract survives property checks and fuzz tamper rejection.
acceptance: forge-p02-visioner-alternative property/fuzz slice PASS (A07 tests when added).
commands: npx tsx --test src/forge-p02-visioner-alternative.property-fuzz.test.ts
blast_radius: src/forge-p02-visioner-alternative*
rollback: P02-B07-A07 property/fuzz değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: property/fuzz requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B07-A06
last_commit: 6b74391
tests: PASS — forge-p02-visioner-alternative.test.ts (24/24); forge-p02-visioner-alternative-baseline.test.ts (3/3)
evidence: validateVisionerAlternativeFailureRecoveryRunRecord + runVisionerAlternativeFailureRecoverySliceWithRecord; 6/6 failure/recovery/NO-GO probes aligned; 23/23 full matrix preserved
next: P02-B07-A07

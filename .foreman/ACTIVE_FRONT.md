# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 175/1000
phase_progress: 75/100
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

P02-B08-A07 — Vision scoring property/fuzz slice: unit, property ve fuzz doğrulamasını ekle.

objective: P02-B08-A06 evidence slice PASS; wire property checks and fuzz validation for scoring contract/run record.
target: runVisionerScoringPropertyChecks and related fuzz validators.
hypothesis: A06 run record builders enable property/fuzz gates without orchestrator refactor.
acceptance: forge-p02-visioner-scoring property/fuzz tests; probe matrix remains fully aligned.
commands: npx tsx --test src/forge-p02-visioner-scoring.test.ts src/forge-p02-visioner-scoring.property-fuzz.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A07 property/fuzz değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: property/fuzz slice requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A06
last_commit: 911f9c5
tests: PASS — forge-p02-visioner-scoring.test.ts (27/27), forge-p02-visioner-scoring-baseline.test.ts (3/3)
evidence: validateVisionerScoringFailureRecoveryRunRecord 6 probes; runVisionerScoringFailureRecoverySliceWithRecord PASS; full run record 23/23 aligned
next: P02-B08-A07

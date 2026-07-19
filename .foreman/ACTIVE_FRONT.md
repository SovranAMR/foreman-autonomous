# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 176/1000
phase_progress: 76/100
block_progress: 7/10
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

P02-B08-A08 — Vision scoring Forge integration: regression testini tamamla.

objective: P02-B08-A07 property/fuzz slice PASS; wire Forge regression gate for visioner scoring probe matrix.
target: detectVisionerScoringProbeRegression and orchestrator integration seam.
hypothesis: A07 property/fuzz gates enable regression detection without orchestrator refactor.
acceptance: forge-p02-visioner-scoring regression integration tests; probe matrix remains fully aligned.
commands: npx tsx --test src/forge-p02-visioner-scoring.test.ts src/forge-p02-visioner-scoring.property-fuzz.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A08 regression integration değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: regression slice requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A07
last_commit: pending
tests: PASS — forge-p02-visioner-scoring.test.ts (27/27), forge-p02-visioner-scoring-baseline.test.ts (3/3), forge-p02-visioner-scoring.property-fuzz.test.ts (5/5)
evidence: runVisionerScoringPropertyChecks 8/8; fixture fuzz 72/72 rejected; run record fuzz failure-recovery 5/5 + full 3/3 rejected
next: P02-B08-A08

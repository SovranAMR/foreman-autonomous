# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A06
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 174/1000
phase_progress: 74/100
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

P02-B08-A06 — Vision scoring evidence slice: evidence, telemetry ve provenance kaydını ekle.

objective: P02-B08-A05 failure/recovery slice PASS; wire evidence record for failure/recovery run.
target: validateVisionerScoringFailureRecoveryRunRecord and related run record builders.
hypothesis: A05 failure/recovery helper enables evidence record without orchestrator refactor.
acceptance: forge-p02-visioner-scoring failure/recovery evidence tests; probe matrix remains fully aligned.
commands: npx tsx --test src/forge-p02-visioner-scoring.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A06 evidence değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: evidence slice requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A05
last_commit: 9f0c4ef
tests: PASS — forge-p02-visioner-scoring.test.ts (24/24), forge-p02-visioner-scoring-baseline.test.ts (3/3)
evidence: validateVisionerScoringFailureRecoveryProbeMatrix 6 passAligned + 0 gapAligned; runVisionerScoringFailureRecoverySlice PASS
next: P02-B08-A06

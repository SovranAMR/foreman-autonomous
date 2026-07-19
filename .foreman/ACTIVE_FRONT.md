# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A02
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 170/1000
phase_progress: 69/100
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

P02-B08-A02 — Vision scoring typed contract: define measurable acceptance criteria.

objective: P02-B08-A01 baseline PASS; formalize scoring contract.
target: Typed contract with measurable probes for all visioner scoring categories.
hypothesis: A01 baseline fixture and probe matrix provide contract entry points.
acceptance: forge-p02-visioner-scoring contract coverage aligned with baseline fixture.
commands: npx tsx --test src/forge-p02-visioner-scoring.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: contract requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A01
last_commit: 56b5857
tests: PASS — forge-p02-visioner-scoring-baseline.test.ts (3/3)
evidence: runVisionerScoringProbes measures 23 probes from P02-B07 handoff; documented FAIL gap vsco.structured_tradeoff_recovery
next: P02-B08-A02

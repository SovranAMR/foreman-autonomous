# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B04
active_atom: P04-B04-A10
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 339/1000
phase_progress: 39/100
block_progress: 9/10
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

P04-B04-A10 — Benchmark ve prior-art analizi: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P04-B04-A09 PASS; guard controls exercised against benchmark prior-art regression gate record.
target: Forge benchmark prior-art block gate seal and P04-B05 handoff contract.
hypothesis: Block gate evidence seals all ten atoms with valid regression and guard metrics.
acceptance: runForgeResearcherBenchmarkPriorArtBlockGate passes; handoff contract validates P04-B05 entry.
commands: npx tsx --test src/forge-p04-researcher-benchmark-prior-art*.test.ts
blast_radius: src/forge-p04-researcher-benchmark-prior-art*.ts
rollback: P04-B04-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B04-A09
last_commit: pending
tests: PASS — forge-p04-researcher-benchmark-prior-art.guard.test.ts (8/8); forge-p04-researcher-benchmark-prior-art.test.ts (8/8); forge-p04-researcher-benchmark-prior-art-baseline.test.ts (19/19); forge-p04-researcher-benchmark-prior-art.property-fuzz.test.ts (6/6); forge-pipeline-regression.integration.test.ts P04-B04-A08 guard (5/5); validateForgeResearcherBenchmarkPriorArtGuard; verifyForgeResearcherBenchmarkPriorArtGuard
evidence: adversarial/performance/cost/safety guard controls reject tampered benchmark prior-art records; orchestrator emits researcher_benchmark_prior_art_guard verification with adversarial=3/3
next: P04-B04-A10

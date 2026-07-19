# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B04
active_atom: P04-B04-A09
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 338/1000
phase_progress: 38/100
block_progress: 8/10
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

P04-B04-A09 — Benchmark ve prior-art analizi: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P04-B04-A08 PASS; guard controls exercised against benchmark prior-art regression gate record.
target: Forge benchmark prior-art guard validation seam for adversarial/performance/cost/safety controls.
hypothesis: Guard controls reject tampered benchmark prior-art run records before block seal.
acceptance: validateForgeResearcherBenchmarkPriorArtGuard rejects adversarial scenarios; regression gate guard metrics pass.
commands: npx tsx --test src/forge-p04-researcher-benchmark-prior-art*.test.ts
blast_radius: src/forge-p04-researcher-benchmark-prior-art*.ts
rollback: P04-B04-A09 guard control değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B04-A08
last_commit: 056e44b
tests: PASS — forge-p04-researcher-benchmark-prior-art.test.ts (8/8); forge-p04-researcher-benchmark-prior-art-baseline.test.ts (19/19); forge-p04-researcher-benchmark-prior-art.property-fuzz.test.ts (6/6); forge-pipeline-regression.integration.test.ts P04-B04-A08 (5/5); runResearcherBenchmarkPriorArtForgeRegression; runResearcherBenchmarkPriorArtPropertyFuzzSlice
evidence: runResearcherBenchmarkPriorArtPropertyFuzzSlice wired into runResearcherBenchmarkPriorArtForgeRegression and forge-pipeline-regression integration gate with zero accepted mutations
next: P04-B04-A09

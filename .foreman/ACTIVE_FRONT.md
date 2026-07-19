# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B04
active_atom: P04-B04-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 332/1000
phase_progress: 32/100
block_progress: 2/10
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

P04-B04-A03 — Benchmark ve prior-art analizi: en küçük üretim dikey dilimini uygula.

objective: P04-B04-A02 PASS; typed contract v1 with fixture↔contract alignment gate.
target: recoverBenchmarkPriorArtEvidence production slice; probe matrix validation.
hypothesis: Minimal vertical slice closes rbpa.structured_benchmark_prior_art_recovery FAIL gap.
acceptance: recoverBenchmarkPriorArtEvidence exported; documented FAIL gap resolved; matrix valid.
commands: npx tsx --test src/forge-p04-researcher-benchmark-prior-art*.test.ts
blast_radius: src/forge-p04-researcher-benchmark-prior-art*.ts
rollback: P04-B04-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B04-A02
last_commit: 5ff39fd
tests: PASS — forge-p04-researcher-benchmark-prior-art.test.ts (8/8); forge-p04-researcher-benchmark-prior-art-baseline.test.ts (7/7); contract v1 23 probes; 1 documented FAIL gap rbpa.structured_benchmark_prior_art_recovery
evidence: getActiveResearcherBenchmarkPriorArtContract; validateResearcherBenchmarkPriorArtAgainstContract; validateResearcherBenchmarkPriorArtContractCoverage; summarizeResearcherBenchmarkPriorArtContractCoverage
next: P04-B04-A03

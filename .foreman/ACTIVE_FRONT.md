# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B04
active_atom: P04-B04-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 337/1000
phase_progress: 37/100
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

P04-B04-A08 — Benchmark ve prior-art analizi: Forge entegrasyonu ile regression testini tamamla.

objective: P04-B04-A07 PASS; property and fuzz validation for benchmark prior-art evidence run records and contract invariants.
target: Forge integration regression test wiring for benchmark prior-art property/fuzz slice.
hypothesis: Integrated regression gate catches benchmark prior-art contract drift before block seal.
acceptance: runResearcherBenchmarkPriorArtPropertyFuzzSlice wired into forge regression integration test; zero accepted mutations.
commands: npx tsx --test src/forge-p04-researcher-benchmark-prior-art*.test.ts
blast_radius: src/forge-p04-researcher-benchmark-prior-art*.ts
rollback: P04-B04-A08 regression integration değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B04-A07
last_commit: 507314a
tests: PASS — forge-p04-researcher-benchmark-prior-art.test.ts (8/8); forge-p04-researcher-benchmark-prior-art-baseline.test.ts (19/19); forge-p04-researcher-benchmark-prior-art.property-fuzz.test.ts (6/6); runResearcherBenchmarkPriorArtPropertyValidation; runResearcherBenchmarkPriorArtRunRecordFuzzValidation; runResearcherBenchmarkPriorArtPropertyFuzzSlice
evidence: runResearcherBenchmarkPriorArtPropertyValidation; runResearcherBenchmarkPriorArtFuzzValidation; runResearcherBenchmarkPriorArtRunRecordFuzzValidation; runResearcherBenchmarkPriorArtPropertyFuzzSlice with zero accepted mutations
next: P04-B04-A08

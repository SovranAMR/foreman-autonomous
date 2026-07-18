# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 51/1000
phase_progress: 51/100
block_progress: 2/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-18

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

P01-B06-A03 — Benchmark ve eval harness: en küçük üretim dikey dilimini uygula.

objective: A02 typed contract üzerine contract-wired probe production slice uygula.
target: runBenchmarkEvalProductionSlice; zero unexpected PASS mismatches.
hypothesis: Contract-wired probes A01 baseline ile uyumlu çalışır.
acceptance: production slice test PASS; contract matrix validation PASS.
commands: npx tsx --test src/forge-benchmark-eval-harness.test.ts
blast_radius: forge-benchmark-eval-harness*.ts
rollback: A03 production slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A02
last_commit: pending
tests: PASS — forge-benchmark-eval-harness.test.ts (9/9)
evidence: FORGE_BENCHMARK_EVAL_CONTRACT_V1; 26 probes / 9 categories; fixture ↔ contract aligned; criteria wired
next: P01-B06-A03

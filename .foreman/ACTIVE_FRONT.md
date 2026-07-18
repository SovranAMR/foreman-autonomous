# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 50/1000
phase_progress: 50/100
block_progress: 1/10
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

P01-B06-A02 — Benchmark ve eval harness: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: A01 baseline fixture üzerine typed benchmark eval contract ve category acceptance tanımla.
target: FORGE_BENCHMARK_EVAL_CONTRACT_V1; fixture ↔ contract alignment.
hypothesis: A01 26-probe matrix A02 contract ile birebir eşleşebilir.
acceptance: contract coverage test PASS; fixture validates against contract.
commands: npx tsx --test src/forge-benchmark-eval-harness.test.ts
blast_radius: forge-benchmark-eval-harness*.ts
rollback: A02 contract değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A01
last_commit: 6016195
tests: PASS — forge-benchmark-eval-harness.test.ts (3/3)
evidence: 26-probe benchmark eval baseline; 8 documented FAIL gaps; B05 handoff aligned
next: P01-B06-A02

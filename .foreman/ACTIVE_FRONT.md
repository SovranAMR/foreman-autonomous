# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A05
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 53/1000
phase_progress: 52/100
block_progress: 4/10
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

P01-B06-A05 — Benchmark ve eval harness: failure, recovery ve NO-GO yollarını uygula.

objective: A04 boundary slice üzerine failure/recovery/nogo-category probe matrix slice uygula.
target: runBenchmarkEvalFailureRecoverySlice; zero unexpected PASS mismatches.
hypothesis: Failure/recovery/NO-GO probes contract-wired çalışır; documented FAIL gaps korunur.
acceptance: failure/recovery slice test PASS; failure/recovery matrix validation PASS.
commands: npx tsx --test src/forge-benchmark-eval-harness.test.ts
blast_radius: forge-benchmark-eval-harness*.ts
rollback: A05 failure/recovery slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A04
last_commit: 4e23f14
tests: PASS — forge-benchmark-eval-harness.test.ts (13/13)
evidence: runBenchmarkEvalBoundarySlice; validateBenchmarkEvalBoundaryProbeMatrix; 2 passAligned / 1 gapAligned; zero unexpected mismatches
next: P01-B06-A05

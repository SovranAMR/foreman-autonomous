# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A06
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 54/1000
phase_progress: 53/100
block_progress: 5/10
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

P01-B06-A06 — Benchmark ve eval harness: evidence, telemetry ve provenance kaydını ekle.

objective: A05 failure/recovery slice üzerine evidence/telemetry/provenance run record slice uygula.
target: runBenchmarkEvalFailureRecoverySliceWithRecord; validateBenchmarkEvalFailureRecoveryRunRecord.
hypothesis: Failure/recovery probe evidence, telemetry ve provenance contract-wired kaydedilir.
acceptance: failure/recovery run record test PASS; run record validation PASS.
commands: npx tsx --test src/forge-benchmark-eval-harness.test.ts
blast_radius: forge-benchmark-eval-harness*.ts
rollback: A06 evidence slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A05
last_commit: 00892ad
tests: PASS — forge-benchmark-eval-harness.test.ts (16/16)
evidence: runBenchmarkEvalFailureRecoverySlice; validateBenchmarkEvalFailureRecoveryProbeMatrix; 6 passAligned / 3 gapAligned; zero unexpected mismatches
next: P01-B06-A06

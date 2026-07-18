# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A08
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 56/1000
phase_progress: 55/100
block_progress: 7/10
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

P01-B06-A08 — Benchmark ve eval harness: Forge entegrasyonu ile regression testini tamamla.

objective: A07 property/fuzz slice üzerine orchestrator regression integration gate uygula.
target: runBenchmarkEvalRegressionIntegration; forge-pipeline-regression.integration.test.ts benchmark eval slice.
hypothesis: Sealed benchmark eval harness probes survive orchestrator wiring without unexpected mismatches.
acceptance: regression integration test PASS; benchmark eval slice wired in orchestrator seam.
commands: npx tsx --test src/forge-pipeline-regression.integration.test.ts
blast_radius: forge-benchmark-eval-harness*.ts, forge-pipeline-regression.integration.test.ts, orchestrator.ts
rollback: A08 regression integration değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A07
last_commit: c51d773
tests: PASS — forge-benchmark-eval-harness.test.ts (22/22)
evidence: runBenchmarkEvalPropertyChecks; runBenchmarkEvalFuzzValidation; runBenchmarkEvalRunRecordFuzzValidation; validateBenchmarkEvalFailureRecoveryRunRecord property gate; 8 properties; 24 fixture mutations rejected; 5 run record mutations rejected on A06 slice
next: P01-B06-A08

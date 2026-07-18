# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 57/1000
phase_progress: 56/100
block_progress: 8/10
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

P01-B06-A09 — Benchmark ve eval harness: adversarial, performance, cost ve safety kontrolünü geçir.

objective: A08 regression integration üzerine benchmark eval guard gate uygula.
target: validateForgeBenchmarkEvalGuard; verifyForgeBenchmarkEvalGuard orchestrator seam.
hypothesis: Sealed benchmark eval run record survives adversarial/perf/cost/safety guard without false PASS.
acceptance: guard test PASS; orchestrator verifyForgeBenchmarkEvalGuard wired.
commands: npx tsx --test src/forge-benchmark-eval-harness.guard.test.ts
blast_radius: forge-benchmark-eval-harness*.ts, orchestrator.ts
rollback: A09 guard değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: guard uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A08
last_commit: 81eefe5
tests: PASS — forge-pipeline-regression.integration.test.ts (5/5 B06-A08 slice); forge-benchmark-eval-harness.test.ts (22/22)
evidence: runForgeBenchmarkEvalRegressionGate; runBenchmarkEvalRegressionIntegration; detectBenchmarkEvalProbeRegression; verifyForgeBenchmarkEvalRegression orchestrator seam; 26/26 probes aligned; benchmark_regression_export + eval_harness_orchestrator_wired gap closed
next: P01-B06-A09

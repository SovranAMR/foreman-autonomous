# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B06
active_atom: P01-B06-A10
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 58/1000
phase_progress: 57/100
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

P01-B06-A10 — Benchmark ve eval harness: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: A09 guard PASS üzerine B06 block gate seal uygula.
target: runForgeBenchmarkEvalBlockGate; verifyForgeBenchmarkEvalBlockGate orchestrator seam.
hypothesis: Sealed B06 block gate evidence includes regression+guard PASS and valid B07 handoff.
acceptance: block gate test PASS; orchestrator verifyForgeBenchmarkEvalBlockGate wired.
commands: npx tsx --test src/forge-benchmark-eval-block-gate.test.ts
blast_radius: forge-benchmark-eval-harness*.ts, orchestrator.ts
rollback: A10 block gate değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: block gate uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A09
last_commit: PENDING
tests: PASS — forge-benchmark-eval-harness.guard.test.ts (8/8); forge-benchmark-eval-harness.test.ts (22/22); forge-pipeline-regression.integration.test.ts (B06 slice 5/5)
evidence: validateForgeBenchmarkEvalGuard; verifyForgeBenchmarkEvalGuard orchestrator seam; adversarial/perf/cost/safety guard; runForgeBenchmarkEvalRegressionGate guard PASS; bench.forge_guard_exports probe wired
next: P01-B06-A10

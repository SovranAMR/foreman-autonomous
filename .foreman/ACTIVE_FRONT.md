# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B07
active_atom: P01-B07-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 59/1000
phase_progress: 58/100
block_progress: 0/10
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

P01-B07-A01 — Reproducible fixture sistemi: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: Sealed B06 benchmark eval artifacts üzerine reproducible fixture baseline kur.
target: loadReproducibleFixtureBaseline; validateReproducibleFixtureBaseline.
hypothesis: Failing baseline fixture captures reproducibility gaps from B06 sealed handoff.
acceptance: baseline fixture test PASS; contract-wired probe matrix documents known gaps.
commands: npx tsx --test src/forge-reproducible-fixture-baseline.test.ts
blast_radius: forge-reproducible-fixture*.ts, fixtures/
rollback: A01 baseline değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: baseline uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B06-A10
last_commit: 8831d13
tests: PASS — forge-benchmark-eval-block-gate.test.ts (6/6); forge-benchmark-eval-harness.guard.test.ts (8/8); forge-benchmark-eval-harness.test.ts (22/22); forge-pipeline-regression.integration.test.ts (B06 slice 5/5)
evidence: runForgeBenchmarkEvalBlockGate; verifyForgeBenchmarkEvalBlockGate orchestrator seam; FORGE_P01_B06_TO_B07_HANDOFF_V1 handoff→P01-B07
next: P01-B07-A01

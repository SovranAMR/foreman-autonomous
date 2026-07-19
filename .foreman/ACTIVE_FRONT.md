# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B07
active_atom: P01-B07-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 67/1000
phase_progress: 66/100
block_progress: 6/10
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

P01-B07-A09 — Reproducible fixture sistemi: adversarial, performance, cost ve safety kontrolünü geçir.

objective: A08 regression gate üzerine guard/adversarial kontrollerini tamamla.
target: validateForgeReproducibleFixtureGuard; runReproducibleFixtureAdversarialGuardChecks.
hypothesis: Guard rejects tampered records and canonical run passes perf/cost/safety limits.
acceptance: guard test PASS; regression gate guard metrics preserved.
commands: npx tsx --test src/forge-reproducible-fixture.guard.test.ts
blast_radius: forge-reproducible-fixture*.ts
rollback: A09 guard slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B07-A08
last_commit: bc8994c
tests: PASS — forge-reproducible-fixture-baseline.test.ts (27/27); forge-pipeline-regression.integration.test.ts (+5)
evidence: runReproducibleFixtureRegressionIntegration; detectReproducibleFixtureProbeRegression; runForgeReproducibleFixtureRegressionGate 21/21 aligned; verifyForgeReproducibleFixtureRegression orchestrator seam; guard adversarial=3/3
next: P01-B07-A09

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B10
active_atom: P01-B10-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 97/1000
phase_progress: 96/100
block_progress: 8/10
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

P01-B10-A09 — Entegre Forge baseline gate: adversarial, performance, cost ve safety kontrolünü geçir.

objective: A08 integrated baseline regression sealed; Forge integrated guard gate for adversarial/perf/cost/safety.
target: verifyForgeIntegratedGuard + validateForgeIntegratedBaselineGuard.
hypothesis: A07 property/fuzz + A08 regression sufficient foundation for integrated guard slice.
acceptance: integrated guard gate passes against sealed fixture and contract with zero adversarial leaks.
commands: npx tsx --test src/forge-integrated-baseline*.test.ts src/forge-integrated-baseline.guard.test.ts
blast_radius: src/forge-integrated-baseline.ts, src/orchestrator.ts
rollback: B10-A09 guard slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A08 regression fails ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B10-A08
last_commit: pending
tests: PASS — forge-integrated-baseline*.test.ts (27/27); forge-pipeline-regression.integration.test.ts P01-B10-A08 (4/4); runForgeIntegratedBaselineRegressionGate; verifyForgeIntegratedRegression orchestrator wiring
evidence: runForgeIntegratedBaselineRegressionGate, runIntegratedBaselineProbesWithRecord, detectIntegratedBaselineProbeRegression, verifyForgeIntegratedRegression lazy-loads integrated baseline regression gate
next: P01-B10-A09

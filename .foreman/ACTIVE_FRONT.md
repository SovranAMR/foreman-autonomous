# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 8/1000
phase_progress: 8/100
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

P01-B01-A09 — Mission ve acceptance contract: adversarial, performance, cost ve safety kontrolünü geçir.

objective: Contract kabul kriterlerine adversarial, performance, cost ve safety kontrolünü ekle.
target: A09 kapsamında belirlenecek.
hypothesis: Forge regression gate orchestrator seam'de; sıradaki dilim adversarial/perf/cost/safety.
acceptance: Adversarial/perf/cost/safety davranışı + hedefli test PASS + regression PASS.
commands: A09 kapsamında belirlenecek.
blast_radius: A09 kapsamında belirlenecek tek seam.
rollback: A09 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: kontrol path seçilemezse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A08
last_commit: 11514b1
tests: PASS — forge-pipeline-baseline (3/3), forge-pipeline-regression.integration (4/4), forge-baseline-contract (8/8), forge-baseline-contract.property-fuzz (4/4)
evidence: runForgeBaselineRegressionGate (27/27 aligned), detectBaselineProbeRegression (misaligned probe flagged), Orchestrator.verifyForgeBaselineRegression emits baseline_regression verification event
next: P01-B01-A09

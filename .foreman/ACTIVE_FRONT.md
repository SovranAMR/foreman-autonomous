# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B05
active_atom: P01-B05-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 47/1000
phase_progress: 46/100
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

P01-B05-A09 — Pipeline invariant engine: adversarial, performance, cost ve safety kontrolünü geçir.

objective: A08 regression gate üzerinde guard kontrollerini mühürle ve adversarial senaryoları doğrula.
target: validateForgePipelineInvariantEngineGuard; adversarial guard scenarios; dedicated guard test suite.
hypothesis: A08 guard foundation ile A09 dedicated guard suite sıfır false reject ile kapanabilir.
acceptance: forge-pipeline-invariant-engine.guard.test.ts PASS; adversarial scenarios rejected; guard metrics bounded.
commands: npx tsx --test src/forge-pipeline-invariant-engine.guard.test.ts src/forge-pipeline-invariant-engine.test.ts
blast_radius: forge-pipeline-invariant-engine*.ts, orchestrator.ts
rollback: A09 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B05-A08
last_commit: pending
tests: PASS — forge-pipeline-invariant-engine + regression integration (34/34)
evidence: runForgePipelineInvariantEngineRegressionGate 32/32 aligned; detectPipelineInvariantEngineProbeRegression flags misalignment; verifyForgePipelineInvariantEngineRegression emits pipeline_invariant_engine_regression; guard PASS with 3/3 adversarial rejected
next: P01-B05-A09

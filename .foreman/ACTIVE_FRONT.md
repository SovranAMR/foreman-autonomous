# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B05
active_atom: P01-B05-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 48/1000
phase_progress: 47/100
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

P01-B05-A10 — Pipeline invariant engine: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: B05 block gate suite ile 10 atom kanıtını mühürle ve B06 handoff hazırla.
target: runForgePipelineInvariantEngineBlockGate; block gate test suite; orchestrator verify hook.
hypothesis: A09 guard suite ile B10 block gate sıfır regression ile kapanabilir.
acceptance: forge-pipeline-invariant-engine-block-gate.test.ts PASS; block gate sealed; B06 handoff ready.
commands: npx tsx --test src/forge-pipeline-invariant-engine-block-gate.test.ts
blast_radius: forge-pipeline-invariant-engine*.ts, orchestrator.ts
rollback: A10 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B05-A09
last_commit: 1c81301
tests: PASS — forge-pipeline-invariant-engine.guard.test.ts + forge-pipeline-invariant-engine.test.ts (30/30)
evidence: validateForgePipelineInvariantEngineGuard PASS; 3/3 adversarial rejected; perf/cost/safety bounded; verifyForgePipelineInvariantEngineGuard emits pipeline_invariant_engine_guard
next: P01-B05-A10

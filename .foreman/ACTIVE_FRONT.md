# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B05
active_atom: P01-B05-A08
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 46/1000
phase_progress: 45/100
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

P01-B05-A08 — Pipeline invariant engine: Forge entegrasyonu ile regression testini tamamla.

objective: Pipeline invariant engine property/fuzz gate sonrası Forge regression entegrasyon dilimini uygula.
target: Sealed P01-B05-A07 property/fuzz contract üzerinde orchestrator regression gate.
hypothesis: A07 property/fuzz validation sonrası A08 regression gate sıfır unexpected mismatch ile kapanabilir.
acceptance: runForgePipelineInvariantEngineRegressionGate; probe regression detection; guard PASS; record validation PASS.
commands: npx tsx --test src/forge-pipeline-invariant-engine.test.ts src/forge-pipeline-regression.integration.test.ts
blast_radius: forge-pipeline-invariant-engine*.ts, orchestrator.ts
rollback: A08 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B05-A07
last_commit: pending
tests: PASS — forge-pipeline-invariant-engine A07 property/fuzz (26/26 including property-fuzz.test.ts)
evidence: runPipelineInvariantEnginePropertyChecks 7/7; runPipelineInvariantEngineFuzzValidation 24/24 rejected per seed; runPipelineInvariantEngineRunRecordFuzzValidation 3/3 mutations rejected; harness version 1.0.0-a06 preserved
next: P01-B05-A08

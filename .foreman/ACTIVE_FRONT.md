# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B05
active_atom: P01-B05-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 45/1000
phase_progress: 44/100
block_progress: 5/10
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

P01-B05-A07 — Pipeline invariant engine: unit, property ve fuzz doğrulamasını ekle.

objective: Pipeline invariant engine evidence run record sonrası property/fuzz doğrulama dilimini uygula.
target: Sealed P01-B05-A06 evidence/telemetry contract üzerinde structural property ve fuzz gate.
hypothesis: A06 run record validation sonrası A07 property/fuzz slice sıfır validation issue ile kapanabilir.
acceptance: property checks; fuzz mutations rejected; run record fuzz validation PASS.
commands: npx tsx --test src/forge-pipeline-invariant-engine.test.ts src/forge-pipeline-invariant-engine.property-fuzz.test.ts
blast_radius: forge-pipeline-invariant-engine*.ts
rollback: A07 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B05-A06
last_commit: pending
tests: PASS — forge-pipeline-invariant-engine A06 evidence slice (20/20)
evidence: runPipelineInvariantEngineFailureRecoverySliceWithRecord + validatePipelineInvariantEngineFailureRecoveryRunRecord; 9 failure/recovery probes with evidence/telemetry/provenance; runPipelineInvariantEngineProbesWithRecord 32/32; harness version 1.0.0-a06; sliceAtom P01-B05-A06 with failure_path/recovery_path/nogo_path categories; zero validation issues
next: P01-B05-A07

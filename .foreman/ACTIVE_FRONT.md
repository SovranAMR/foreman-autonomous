# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B05
active_atom: P01-B05-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 44/1000
phase_progress: 43/100
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

P01-B05-A06 — Pipeline invariant engine: evidence, telemetry ve provenance kaydını ekle.

objective: Pipeline invariant engine failure/recovery slice sonrası evidence run record ve provenance kaydını uygula.
target: Sealed P01-B05-A05 failure/recovery slice üzerinde evidence/telemetry contract.
hypothesis: A05 failure-recovery matrix sonrası A06 evidence slice sıfır validation issue ile kapanabilir.
acceptance: run record schema; probe evidence artifacts; provenance fields; failure/recovery slice record validation PASS.
commands: npx tsx --test src/forge-pipeline-invariant-engine.test.ts
blast_radius: forge-pipeline-invariant-engine*.ts
rollback: A06 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B05-A05
last_commit: pending
tests: PASS — forge-pipeline-invariant-engine A05 failure/recovery slice (17/17)
evidence: runPipelineInvariantEngineFailureRecoverySlice with validatePipelineInvariantEngineFailureRecoveryProbeMatrix; 9 failure/recovery probes (failure_path/recovery_path/nogo_path); 6 passAligned + 3 gapAligned; zero unexpected mismatches; harness version 1.0.0-a05; documented invariant engine wiring gaps preserved
next: P01-B05-A06

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A06
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 84/1000
phase_progress: 83/100
block_progress: 5/10
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

P01-B09-A06 — Orchestrator seam ve modülerleşme: evidence, telemetry ve provenance kaydını ekle.

objective: A05 failure/recovery slice sealed; evidence/telemetry/provenance run record for failure/recovery probes.
target: forge-orchestrator-seam.ts failure/recovery run record; validateOrchestratorSeamFailureRecoveryRunRecord.
hypothesis: A05 slice + evidence artifact A06 pattern yeterli orchestrator seam run record sağlar.
acceptance: failure/recovery run record validates; disposition/criterion/aligned outcomes recorded.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts (A06 suite when present)
blast_radius: forge-orchestrator-seam*.ts
rollback: A06 evidence run record değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A05 failure/recovery slice invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A05
last_commit: c4065a5
tests: PASS — forge-orchestrator-seam*.test.ts (16/16); failureRecovery=6; passAligned=2; gapAligned=4; unexpectedMismatches=0
evidence: runOrchestratorSeamFailureRecoverySlice; validateOrchestratorSeamFailureRecoveryProbeMatrix; documented FAIL gaps preserved
next: P01-B09-A06

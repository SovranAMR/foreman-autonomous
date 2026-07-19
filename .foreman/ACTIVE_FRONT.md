# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 85/1000
phase_progress: 84/100
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

P01-B09-A07 — Orchestrator seam ve modülerleşme: unit, property ve fuzz doğrulamasını ekle.

objective: A06 evidence run record sealed; unit/property/fuzz validation for orchestrator seam failure/recovery probes.
target: forge-orchestrator-seam*.ts property/fuzz gates; runOrchestratorSeamFailureRecoverySliceWithRecord validation.
hypothesis: A06 run record + evidence artifact A07 pattern yeterli unit/property/fuzz coverage sağlar.
acceptance: property/fuzz gates pass; failure/recovery run record mutations rejected.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts (A07 suite when present)
blast_radius: forge-orchestrator-seam*.ts
rollback: A07 property/fuzz değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A06 run record invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A06
last_commit: (pending)
tests: PASS — forge-orchestrator-seam*.test.ts (18/18); failureRecoveryRunRecord=6; disposition/criterion/aligned outcomes recorded
evidence: runOrchestratorSeamFailureRecoverySliceWithRecord; validateOrchestratorSeamFailureRecoveryRunRecord; buildOrchestratorSeamRunRecord
next: P01-B09-A07

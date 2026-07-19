# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B09
active_atom: P04-B09-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 385/1000
phase_progress: 84/100
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

P04-B09-A06 — Research-to-worker handoff: evidence, telemetry ve provenance kaydını ekle.

objective: P04-B09-A05 PASS; failure-recovery slice closes guard-path gaps with zero unexpected mismatches.
target: Complete evidence/telemetry/provenance record for handoff failure-recovery gate paths.
hypothesis: A05 failure-recovery slice enables A06 evidence gate with contract-wired telemetry.
acceptance: Evidence record captures failure/recovery/NO-GO probe outcomes; zero unexpected mismatches in slice.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts
rollback: P04-B09-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Evidence slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A05
last_commit: a6ed711
tests: PASS — forge-p04-researcher-research-to-worker-handoff*.test.ts (33/33); failure-recovery slice 6/6 aligned; unexpectedMismatches=0
evidence: validateResearcherResearchToWorkerHandoffFailureRecoveryProbeMatrix + runResearcherResearchToWorkerHandoffFailureRecoverySlice + failure/recovery/NO-GO guard-path probes
next: P04-B09-A06

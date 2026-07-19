# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 375/1000
phase_progress: 74/100
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

P04-B08-A06 — Spike ve falsification deneyi: evidence, telemetry ve provenance kaydını ekle.

objective: P04-B08-A05 PASS; failure/recovery/NO-GO probe evidence run record with disposition, criterion and aligned outcomes.
target: Evidence slice for failure_path + recovery_path + nogo_path spike falsification guard probes.
hypothesis: Evidence slice records guard-path probe outcomes without regressing A05 failure/recovery wiring.
acceptance: Evidence slice tests pass; run record captures disposition, criterion and aligned probe outcomes.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts
rollback: P04-B08-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A05
last_commit: pending
tests: PASS — forge-p04-researcher-spike-falsification.test.ts (18/18); forge-p04-researcher-spike-falsification-baseline.test.ts (15/15); failure/recovery slice 6/6 probes zero mismatches
evidence: validateResearcherSpikeFalsificationFailureRecoveryProbeMatrix + runResearcherSpikeFalsificationFailureRecoverySlice + recoverSpikeFalsificationEvidence guard paths
next: P04-B08-A06

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A06
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 25/1000
phase_progress: 24/100
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

P01-B03-A06 — Formal state machine: evidence, telemetry ve provenance kaydını ekle.

objective: Formal state machine evidence, telemetry ve provenance kaydını ekle.
target: Failure/recovery slice evidence is recorded with probe disposition and criterion provenance.
hypothesis: A05 failure/recovery slice enables evidence capture on orchestrator FSM gaps.
acceptance: Evidence records include disposition, criterion, and aligned probe outcomes.
commands: npx tsx --test src/forge-formal-state-machine.test.ts
blast_radius: forge-formal-state-machine*.ts
rollback: A06 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: evidence slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A05
last_commit: PENDING
tests: PASS — forge-formal-state-machine (16/16), forge-behavior-map-block-gate (6/6), forge-pipeline-behavior-map (23/23)
evidence: runFormalStateMachineFailureRecoverySlice adds failure_state+recovery_state category gate (6 probes: 2 documented FAIL gaps + 2 recovery + 2 NO-GO); validateFormalStateMachineFailureRecoveryProbeMatrix PASS (4 passAligned, 2 gapAligned, 0 unexpectedMismatches); full matrix 28 probes (26 passAligned, 2 gapAligned)
next: P01-B03-A06

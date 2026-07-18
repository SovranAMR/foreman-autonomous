# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 28/1000
phase_progress: 27/100
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

P01-B03-A09 — Formal state machine: adversarial, performance, cost ve safety kontrolünü geçir.

objective: Formal state machine adversarial, performance, cost ve safety kontrolünü geçir.
target: Guard gate passes on canonical formal state machine run record.
hypothesis: A08 regression gate + A07 fuzz enable guard integration on FSM artifacts.
acceptance: Guard gate passes; adversarial tampered records rejected.
commands: npx tsx --test src/forge-formal-state-machine.test.ts src/forge-formal-state-machine.guard.test.ts
blast_radius: forge-formal-state-machine*.ts
rollback: A09 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: guard slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A08
last_commit: pending
tests: PASS — forge-formal-state-machine (25/25 incl. 4/4 regression)
evidence: runForgeFormalStateMachineRegressionGate 28/28 probes aligned; detectFormalStateMachineProbeRegression flags misalignment; verifyForgeFormalStateMachineRegression emits formal_state_machine_regression verification; validateForgeFormalStateMachineGuard adversarial=3/3
next: P01-B03-A09

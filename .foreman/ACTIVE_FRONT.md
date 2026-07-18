# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A10
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 29/1000
phase_progress: 28/100
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

P01-B03-A10 — Formal state machine: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: Formal state machine block gate kanıtını mühürle ve sonraki block handoff'unu yap.
target: Block gate PASS with B04 handoff contract.
hypothesis: A09 guard + A08 regression + prior atoms seal P01-B03.
acceptance: runForgeFormalStateMachineBlockGate passes; orchestrator emits formal_state_machine_block_gate verification.
commands: npx tsx --test src/forge-formal-state-machine-block-gate.test.ts
blast_radius: forge-formal-state-machine*.ts, orchestrator.ts
rollback: A10 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: block gate uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A09
last_commit: f868893
tests: PASS — forge-formal-state-machine (25/25) + guard (8/8)
evidence: validateForgeFormalStateMachineGuard adversarial=3/3 perf/cost/safety PASS; runForgeFormalStateMachineRegressionGate guard in detail; verifyForgeFormalStateMachineGuard emits formal_state_machine_guard verification
next: P01-B03-A10

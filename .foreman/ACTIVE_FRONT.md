# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 30/1000
phase_progress: 29/100
block_progress: 0/10
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

P01-B04-A01 — Typed phase/event schema: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: Typed phase/event schema için mevcut orchestrator phase/event davranışını ölç; failing baseline fixture oluştur.
target: Baseline fixture with measurable phase/event probes.
hypothesis: Sealed P01-B03 formal state machine artifacts provide entry criteria for typed schema baseline.
acceptance: failing baseline fixture exists; typed contract probes declared.
commands: npx tsx --test src/forge-phase-event-schema.test.ts
blast_radius: forge-phase-event-schema*.ts, orchestrator.ts
rollback: A01 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: baseline ölçülemezse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A10
last_commit: pending
tests: PASS — forge-formal-state-machine-block-gate (6/6)
evidence: runForgeFormalStateMachineBlockGate seals P01-B03 with 10/10 atom seals; handoff=PASS→P01-B04; orchestrator emits formal_state_machine_block_gate verification
next: P01-B04-A01

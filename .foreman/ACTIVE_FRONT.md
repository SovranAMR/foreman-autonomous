# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 23/1000
phase_progress: 23/100
block_progress: 3/10
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

P01-B03-A04 — Formal state machine: boundary ve edge-case davranışlarını tamamla.

objective: Formal state machine boundary ve edge-case davranışlarını tamamla.
target: Boundary probes cover edge transitions and invalid jumps with full alignment.
hypothesis: A03 contract-wired harness enables boundary slice on failure/recovery paths.
acceptance: Boundary category probes execute with zero unexpected mismatches.
commands: npx tsx --test src/forge-formal-state-machine.test.ts
blast_radius: forge-formal-state-machine*.ts
rollback: A04 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: boundary slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A03
last_commit: PENDING
tests: PASS — forge-formal-state-machine (10/10), forge-behavior-map-block-gate (6/6), forge-pipeline-behavior-map (23/23)
evidence: runFormalStateMachineProductionSlice wires harness to contract criteria; validateFormalStateMachineProbeMatrix PASS (18 passAligned, 2 gapAligned, 0 unexpectedMismatches); documented FAIL gaps fsm.orch_blocked_sync + fsm.orch_awaiting_human_sync remain aligned
next: P01-B03-A04

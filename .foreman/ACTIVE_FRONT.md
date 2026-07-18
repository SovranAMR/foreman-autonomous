# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 21/1000
phase_progress: 21/100
block_progress: 1/10
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

P01-B03-A02 — Formal state machine: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: Formal state machine typed contract ile ölçülebilir acceptance kriterlerini tanımla.
target: Typed contract, category invariants, probe-to-criterion mapping.
hypothesis: B03-A01 baseline fixture sealed; A02 adds typed contract layer.
acceptance: Contract defines all six categories, maps 20 probes, disposition coverage for failure/recovery paths.
commands: npx tsx --test src/forge-formal-state-machine.test.ts
blast_radius: forge-formal-state-machine*.ts
rollback: A02 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A01
last_commit: 6afc331
tests: PASS — forge-formal-state-machine (3/3), forge-behavior-map-block-gate (6/6), forge-pipeline-behavior-map (23/23)
evidence: forge-formal-state-machine-v1 fixture (20 probes, 6 categories), runFormalStateMachineProbes documents 2 known FAIL gaps (fsm.orch_blocked_sync, fsm.orch_awaiting_human_sync), 18 PASS probes aligned
next: P01-B03-A02

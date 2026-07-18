# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 20/1000
phase_progress: 20/100
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

P01-B03-A01 — Formal state machine: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: Orchestrator state machine davranışını ölç; failing baseline fixture oluştur.
target: State machine baseline fixture ve probe matrix.
hypothesis: B02 block gate sealed; B03-A01 baseline slice.
acceptance: Baseline fixture loads, probe matrix measurable, at least one failing probe documented.
commands: npx tsx --test src/forge-formal-state-machine.test.ts
blast_radius: forge-formal-state-machine*.ts, types.ts, state.ts
rollback: A01 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B02-A10
last_commit: pending
tests: PASS — forge-behavior-map-block-gate (6/6), forge-pipeline-behavior-map (17/17), forge-pipeline-behavior-map.guard (8/8), forge-pipeline-behavior-map.property-fuzz (4/4), forge-pipeline-regression.integration (8/8)
evidence: runForgeBehaviorMapBlockGate seals P01-B02 (10/10 atom seals), FORGE_P01_B02_TO_B03_HANDOFF_V1 valid, orchestrator verifyForgeBehaviorMapBlockGate emits behavior_map_block_gate verification event
next: P01-B03-A01

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 22/1000
phase_progress: 22/100
block_progress: 2/10
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

P01-B03-A03 — Formal state machine: en küçük üretim dikey dilimini uygula.

objective: Formal state machine en küçük üretim dikey dilimini uygula.
target: Probe harness executes contract probes with zero unexpected mismatches.
hypothesis: B03-A02 typed contract sealed; A03 wires harness to contract criteria.
acceptance: runFormalStateMachineProbes returns aligned results for all PASS probes; documented FAIL gaps remain aligned.
commands: npx tsx --test src/forge-formal-state-machine.test.ts
blast_radius: forge-formal-state-machine*.ts
rollback: A03 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A02
last_commit: 3d2ca72
tests: PASS — forge-formal-state-machine (8/8), forge-behavior-map-block-gate (6/6), forge-pipeline-behavior-map (23/23)
evidence: FORGE_FORMAL_STATE_MACHINE_CONTRACT_V1 defines 6 categories, 20 probes with criterion/disposition; fixture contractAtom=P01-B03-A02; validateFormalStateMachineFixtureAgainstContract PASS; 2 gap probes (failure_state), 2 recovery probes
next: P01-B03-A03

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B03
active_atom: P01-B03-A05
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 24/1000
phase_progress: 24/100
block_progress: 4/10
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

P01-B03-A05 — Formal state machine: failure, recovery ve NO-GO yollarını uygula.

objective: Formal state machine failure, recovery ve NO-GO yollarını uygula.
target: Failure/recovery/NO-GO path probes execute with documented alignment.
hypothesis: A04 boundary slice enables failure/recovery path probes on orchestrator gaps.
acceptance: Failure/recovery category probes execute with zero unexpected mismatches.
commands: npx tsx --test src/forge-formal-state-machine.test.ts
blast_radius: forge-formal-state-machine*.ts
rollback: A05 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: failure slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B03-A04
last_commit: PENDING
tests: PASS — forge-formal-state-machine (13/13), forge-behavior-map-block-gate (6/6), forge-pipeline-behavior-map (23/23)
evidence: runFormalStateMachineBoundarySlice adds boundary category (6 probes: 4 edge transitions + 2 invalid jumps); validateFormalStateMachineBoundaryProbeMatrix PASS (6 passAligned, 0 unexpectedMismatches); full matrix 26 probes (24 passAligned, 2 gapAligned)
next: P01-B03-A05

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 100/1000
phase_progress: 0/100
block_progress: 0/10
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

P02-B01-A01 — Intent ve görev anlamlandırma: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P01 phase gate sealed; visioner intent baseline A01 next.
target: visioner intent baseline fixture + failing probe matrix.
hypothesis: Sealed P01 phase gate artifacts sufficient entry baseline for P02-B01-A01.
acceptance: failing baseline fixture exists; typed contract probes declared.
commands: npx tsx --test src/forge-p02-*.test.ts (when present)
blast_radius: src/forge-p02-visioner-intent*.ts
rollback: P02-B01-A01 slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: baseline probe alignment fails ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-PHASE-GATE
last_commit: pending
tests: PASS — forge-p01-phase-gate.test.ts (6/6); runForgeP01PhaseGate blocks=10/10 atoms=100/100 regression=PASS handoff=PASS→P02-B01; verifyForgeP01PhaseGate orchestrator wiring
evidence: runForgeP01PhaseGate seals all ten P01 block gates; validateForgeP01PhaseGateEvidence PASS; FORGE_P01_TO_P02_PHASE_HANDOFF_V1 targets P02-B01-A01; P01 phase_gate SEALED
next: P02-B01-A01

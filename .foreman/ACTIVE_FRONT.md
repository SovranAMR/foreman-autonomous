# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B10
active_atom: P02-B10-A04
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 192/1000
phase_progress: 91/100
block_progress: 3/10
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

P02-B10-A04 — Vizyoner phase gate: boundary ve edge-case davranışlarını tamamla.

objective: P02-B10-A03 PASS; complete boundary and edge-case behavior for visioner phase gate.
target: forge-p02-visioner-phase-gate boundary slice, input edge cases and probe matrix validation.
hypothesis: boundary category probes align with contract after A03 production slice wiring.
acceptance: boundary slice validates; edge-case probes PASS; zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-visioner-phase-gate.test.ts
blast_radius: src/forge-p02-visioner-phase-gate.ts, src/forge-p02-visioner-phase-gate.probe.ts, src/forge-p02-visioner-phase-gate.test.ts
rollback: P02-B10-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Boundary probes cannot align after A03 slice ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B10-A03
last_commit: pending
tests: PASS — forge-p02-visioner-phase-gate.test.ts (12/12); baseline regression (3/3)
evidence: recoverVisionerPhaseGateEvidence; runVisionerPhaseGateProductionSlice; verifyForgeP02VisionerPhaseGate; 24/24 probes aligned; handoff=P02-B10-A03→A04
next: P02-B10-A04

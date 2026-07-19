# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B10
active_atom: P02-B10-A05
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 193/1000
phase_progress: 92/100
block_progress: 4/10
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

P02-B10-A05 — Vizyoner phase gate: failure, recovery ve NO-GO yollarını uygula.

objective: P02-B10-A04 PASS; implement failure, recovery and NO-GO paths for visioner phase gate.
target: forge-p02-visioner-phase-gate failure/recovery slice, failure_path/recovery_path/nogo_path probe matrix validation.
hypothesis: failure/recovery/NO-GO category probes align with contract after A04 boundary slice wiring.
acceptance: failure/recovery slice validates; failure/recovery/NO-GO probes PASS; zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-visioner-phase-gate.test.ts
blast_radius: src/forge-p02-visioner-phase-gate.ts, src/forge-p02-visioner-phase-gate.probe.ts, src/forge-p02-visioner-phase-gate.test.ts
rollback: P02-B10-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Failure/recovery probes cannot align after A04 slice ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B10-A04
last_commit: 662222f
tests: PASS — forge-p02-visioner-phase-gate.test.ts (20/20); baseline regression (3/3)
evidence: assessVisionerPhaseGateInputBoundary; runVisionerPhaseGateBoundarySlice; validateVisionerPhaseGateBoundaryProbeMatrix; 24/24 probes aligned; boundary 6/6; handoff=P02-B10-A04→A05
next: P02-B10-A05

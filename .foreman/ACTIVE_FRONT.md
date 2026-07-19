# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B10
active_atom: P04-B10-A04
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 394/1000
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

P04-B10-A05 — Araştırmacı phase gate: failure, recovery ve NO-GO yollarını uygula.

objective: P04-B10-A04 PASS; boundary slice matrix valid with zero manifest edge-case mismatches.
target: Complete failure/recovery/NO-GO slice for phase gate evidence validators and orchestrator guard paths.
hypothesis: Boundary slice from A04 enables targeted A05 failure/recovery probe matrix validation.
acceptance: Failure/recovery/NO-GO probes flip to PASS; slice matrix valid; zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher-phase-gate*.test.ts
blast_radius: src/forge-p04-researcher-phase-gate*.ts
rollback: P04-B10-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Failure/recovery slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B10-A04
last_commit: e9d3d95
tests: PASS — forge-p04-researcher-phase-gate-baseline.test.ts (8/8); forge-p04-researcher-phase-gate-contract.test.ts (8/8); forge-p04-researcher-phase-gate.test.ts (10/10); boundary probes=6/6
evidence: validateResearcherPhaseGateBoundaryProbeMatrix + runResearcherPhaseGateBoundarySlice + assessResearcherPhaseGateInputBoundary manifest edge cases
next: P04-B10-A05

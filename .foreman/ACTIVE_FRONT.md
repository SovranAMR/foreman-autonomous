# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B10
active_atom: P04-B10-A04
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 393/1000
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

P04-B10-A04 — Araştırmacı phase gate: boundary ve edge-case davranışlarını tamamla.

objective: P04-B10-A03 PASS; orchestrator phase gate runner and P04→P05 handoff gaps closed.
target: Complete boundary slice for manifest input edge cases and documented gaps with zero mismatches.
hypothesis: Production slice from A03 enables targeted A04 boundary probe matrix validation.
acceptance: Boundary probes flip to PASS; boundary slice matrix valid; zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher-phase-gate*.test.ts
blast_radius: src/forge-p04-researcher-phase-gate*.ts
rollback: P04-B10-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Boundary slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B10-A03
last_commit: fa685db
tests: PASS — forge-p04-researcher-phase-gate-baseline.test.ts (8/8); forge-p04-researcher-phase-gate-contract.test.ts (8/8); forge-p04-researcher-phase-gate.test.ts (7/7); gap probes=0/0
evidence: verifyForgeP04ResearcherPhaseGate + getForgeP04ToP05PhaseHandoff + runResearcherPhaseGateProductionSlice + validateResearcherPhaseGateProbeMatrix
next: P04-B10-A04

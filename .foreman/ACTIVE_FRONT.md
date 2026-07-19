# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B10
active_atom: P03-PHASE-GATE
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 299/1000
phase_progress: 100/100
block_progress: 10/10
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

P03-PHASE-GATE — Stratejist phase gate: phase gate kanıtını mühürle ve P04 handoff'unu yap.

objective: P03-B10-A10 PASS; P03 phase gate seal and P04 handoff.
target: runForgeStrategistPhaseGateBlockGate seals A01–A10 deliverables; guard/regression embedded; P04 handoff valid.
hypothesis: P03-B10-A10 block gate slice seals strategist phase gate with orchestrator inventory check.
acceptance: block gate PASS; handoff valid; slice atom tagged P03-B10-A10.
commands: npx tsx --test src/forge-p03-strategist-phase-gate*.test.ts
blast_radius: src/forge-p03-strategist-phase-gate.ts, src/forge-p03-strategist-phase-gate.probe.ts
rollback: P03-B10-A10 block gate slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B10-A10
last_commit: PENDING
tests: PASS — forge-p03-strategist-phase-gate-block-gate.test.ts (6/6); forge-p03-strategist-phase-gate*.test.ts (59/59)
evidence: runForgeStrategistPhaseGateBlockGate seals 10/10 atom seals; validateStrategistPhaseGateBlockHandoffContract P04-B01 entry; verifyForgeStrategistPhaseGateBlockGate orchestrator seam; handoff=PASS→P04-B01
next: P03-PHASE-GATE

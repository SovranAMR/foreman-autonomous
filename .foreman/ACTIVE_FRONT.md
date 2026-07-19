# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B10
active_atom: P03-B10-A02
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 290/1000
phase_progress: 90/100
block_progress: 1/10
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

P03-B10-A02 — Stratejist phase gate: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P03-B10-A01 PASS; P03-B10-A02 define strategist phase gate typed contract.
target: typed contract coverage, probe matrix alignment with baseline fixture.
hypothesis: P03-B10-A02 extends A01 baseline with full contract coverage validation.
acceptance: Contract declares probes for all phase gate categories; fixture aligns with contract.
commands: npx tsx --test src/forge-p03-strategist-phase-gate*.test.ts
blast_radius: src/forge-p03-strategist-phase-gate.ts
rollback: P03-B10-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B10-A01
last_commit: pending
tests: PASS — forge-p03-strategist-phase-gate-baseline.test.ts (3/3)
evidence: loadStrategistPhaseGateBaseline; runStrategistPhaseGateProbes; validateStrategistPhaseGateBaseline; getForgeP03B09ToB10Handoff; assessStrategistPhaseGateInputBoundary; recoverStrategistPhaseGateEvidence
next: P03-B10-A02

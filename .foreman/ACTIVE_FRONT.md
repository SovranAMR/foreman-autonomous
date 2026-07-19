# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B10
active_atom: P04-B10-A02
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 391/1000
phase_progress: 89/100
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

P04-B10-A02 — Araştırmacı phase gate: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P04-B10-A01 PASS; baseline fixture with 2 documented FAIL gaps from sealed P04-B09 handoff.
target: Extend researcher phase gate contract with measurable acceptance criteria wired to baseline probe matrix.
hypothesis: Sealed P04-B09 block gate and A01 baseline enable P04-B10-A02 typed contract alignment.
acceptance: Contract validates fixture; probe matrix aligned; FAIL gaps preserved until A03 production slice.
commands: npx tsx --test src/forge-p04-researcher-phase-gate*.test.ts
blast_radius: src/forge-p04-researcher-phase-gate*.ts
rollback: P04-B10-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Contract blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B10-A01
last_commit: a7948ac
tests: PASS — forge-p04-researcher-phase-gate-baseline.test.ts (8/8); documented FAIL gaps=2/2; sourceBlockGate=P04-B09-A10
evidence: loadResearcherPhaseGateBaseline + runResearcherPhaseGateProbes + validateResearcherPhaseGateBaseline + recoverResearcherPhaseGateEvidence
next: P04-B10-A02

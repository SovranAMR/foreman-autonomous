# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B10
active_atom: P04-B10-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 392/1000
phase_progress: 90/100
block_progress: 2/10
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

P04-B10-A03 — Araştırmacı phase gate: en küçük üretim dikey dilimini uygula.

objective: P04-B10-A02 PASS; typed contract with 24 probes and 2 documented FAIL gaps preserved.
target: Implement minimal production slice closing orchestrator phase gate runner and P04→P05 handoff gaps.
hypothesis: Typed contract from A02 enables targeted A03 production wiring for remaining gap probes.
acceptance: Gap probes flip to PASS; production slice matrix valid; zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher-phase-gate*.test.ts
blast_radius: src/forge-p04-researcher-phase-gate*.ts, src/orchestrator.ts
rollback: P04-B10-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B10-A02
last_commit: 8abbe4e
tests: PASS — forge-p04-researcher-phase-gate-baseline.test.ts (8/8); forge-p04-researcher-phase-gate-contract.test.ts (8/8); documented FAIL gaps=2/2 preserved
evidence: getActiveResearcherPhaseGateContract + validateResearcherPhaseGateContractCoverage + validateResearcherPhaseGateAgainstContract + summarizeResearcherPhaseGateContractCoverage
next: P04-B10-A03

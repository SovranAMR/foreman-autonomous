# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B10
active_atom: P04-B10-A07
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 396/1000
phase_progress: 94/100
block_progress: 6/10
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

P04-B10-A07 — Araştırmacı phase gate: unit, property ve fuzz doğrulamasını ekle.

objective: P04-B10-A06 PASS; evidence run record validates; slice matrix valid with zero unexpected mismatches.
target: Complete unit/property/fuzz validation for failure/recovery slice evidence run record gates.
hypothesis: Evidence slice from A06 enables targeted A07 property/fuzz validation.
acceptance: Property/fuzz validators reject malformed records; aligned records pass.
commands: npx tsx --test src/forge-p04-researcher-phase-gate*.test.ts
blast_radius: src/forge-p04-researcher-phase-gate*.ts
rollback: P04-B10-A07 property/fuzz değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Property/fuzz slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B10-A06
last_commit: pending
tests: PASS — forge-p04-researcher-phase-gate-baseline.test.ts (8/8); forge-p04-researcher-phase-gate-contract.test.ts (8/8); forge-p04-researcher-phase-gate.test.ts (16/16); evidence probes=7/7
evidence: validateResearcherPhaseGateEvidenceRunRecord + runResearcherPhaseGateEvidenceSlice + runResearcherPhaseGateFailureRecoverySliceWithRecord
next: P04-B10-A07

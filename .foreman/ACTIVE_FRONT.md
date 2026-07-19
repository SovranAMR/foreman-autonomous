# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A07
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 356/1000
phase_progress: 56/100
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

P04-B06-A07 — Contradiction ve freshness çözümü: unit, property ve fuzz doğrulamasını ekle.

objective: P04-B06-A06 PASS; evidence slice 6/6 probes; validateResearcherContradictionFreshnessEvidenceRunRecord + runResearcherContradictionFreshnessEvidenceSlice exported; 31/31 tests PASS.
target: Forge contradiction freshness property/fuzz validation for evidence run records and contract invariants.
hypothesis: Property and fuzz checks harden A06 evidence/telemetry/provenance without regressing failure/recovery slice.
acceptance: Property suite exports; evidence slice remains green; regression suite green.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A07 property/fuzz değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A06
last_commit: d0e039d
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (31/31); evidence slice 6/6 probes PASS; validateResearcherContradictionFreshnessEvidenceRunRecord + runResearcherContradictionFreshnessEvidenceSlice + buildResearcherContradictionFreshnessRunRecord
evidence: failure/recovery slice preserved + evidence/telemetry/provenance run record + disposition/criterion aligned probe outcomes + sliceAtom P04-B06-A06
next: P04-B06-A07

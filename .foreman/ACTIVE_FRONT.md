# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B05
active_atom: P04-B05-A07
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 346/1000
phase_progress: 46/100
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

P04-B05-A07 — Citation ve provenance graph: unit, property ve fuzz doğrulamasını ekle.

objective: P04-B05-A06 PASS; evidence slice gate wired; failure/recovery run record validated; zero mismatches.
target: Forge citation provenance graph property/fuzz validation slice extending evidence run record gate.
hypothesis: Property and fuzz checks enforce structural invariants on evidence run records and contract probes.
acceptance: Property/fuzz suite passes; evidence record invariants hold; regression suite stays green.
commands: npx tsx --test src/forge-p04-researcher-citation-provenance-graph*.test.ts
blast_radius: src/forge-p04-researcher-citation-provenance-graph*.ts
rollback: P04-B05-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B05-A06
last_commit: pending
tests: PASS — forge-p04-researcher-citation-provenance-graph*.test.ts (26/26); runResearcherCitationProvenanceGraphEvidenceSlice; passAligned=4 gapAligned=2
evidence: validateResearcherCitationProvenanceGraphEvidenceRunRecord + runResearcherCitationProvenanceGraphFailureRecoverySliceWithRecord; auditable evidence/telemetry/provenance for 6 failure/recovery probes
next: P04-B05-A07

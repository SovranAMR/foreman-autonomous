# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B05
active_atom: P04-B05-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 347/1000
phase_progress: 47/100
block_progress: 7/10
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

P04-B05-A08 — Citation ve provenance graph: Forge entegrasyonu ile regression testini tamamla.

objective: P04-B05-A07 PASS; property/fuzz suite passes; evidence record invariants hold; zero accepted mutations.
target: Forge citation provenance graph regression integration slice extending property/fuzz gate.
hypothesis: Regression gate wires citation provenance graph slice into orchestrator verification seam.
acceptance: Regression integration suite passes; property/fuzz slice green; full block suite stays green.
commands: npx tsx --test src/forge-p04-researcher-citation-provenance-graph*.test.ts
blast_radius: src/forge-p04-researcher-citation-provenance-graph*.ts
rollback: P04-B05-A08 regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B05-A07
last_commit: pending
tests: PASS — forge-p04-researcher-citation-provenance-graph*.test.ts (32/32); runResearcherCitationProvenanceGraphPropertyFuzzSlice; propertyChecks=8 contractFuzzRejected=true runRecordFuzzRejected=true
evidence: runResearcherCitationProvenanceGraphPropertyValidation + runResearcherCitationProvenanceGraphFuzzValidation + runResearcherCitationProvenanceGraphRunRecordFuzzValidation; 8 structural properties, 72 fixture mutations rejected, 5 run-record mutations rejected
next: P04-B05-A08

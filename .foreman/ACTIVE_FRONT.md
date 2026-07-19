# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B05
active_atom: P04-B05-A04
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 343/1000
phase_progress: 43/100
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

P04-B05-A04 — Citation ve provenance graph: boundary ve edge-case davranışlarını tamamla.

objective: P04-B05-A03 PASS; buildResearchCitationProvenanceGraph + RESEARCHER SOURCES prompt wired; 2 gap probes flipped PASS.
target: Forge citation provenance graph boundary slice closing parser/validator NO-GO debt or next boundary probes.
hypothesis: Boundary slice extends input edge cases and probe matrix gate with zero unexpected mismatches.
acceptance: Boundary probes align PASS; regression suite stays green.
commands: npx tsx --test src/forge-p04-researcher-citation-provenance-graph*.test.ts
blast_radius: src/forge-p04-researcher-citation-provenance-graph*.ts, src/prompts.ts, src/parser.ts
rollback: P04-B05-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B05-A03
last_commit: fcc3adf
tests: PASS — forge-p04-researcher-citation-provenance-graph*.test.ts (17/17); runResearcherCitationProvenanceGraphProductionSlice; gap probes rcpg.researcher_sources_prompt + rcpg.build_research_citation_graph flipped PASS
evidence: contract v1 23 probes (21 PASS / 2 FAIL nogo); buildResearchCitationProvenanceGraph export; RESEARCHER_SYSTEM SOURCES field
next: P04-B05-A04

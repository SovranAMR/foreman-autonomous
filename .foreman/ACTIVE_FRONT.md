# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B05
active_atom: P04-B05-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 342/1000
phase_progress: 42/100
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

P04-B05-A03 — Citation ve provenance graph: en küçük üretim dikey dilimini uygula.

objective: P04-B05-A02 PASS; typed contract v1 with 23 probes, 4 FAIL gaps, fixture↔contract alignment gate.
target: Forge citation provenance graph production slice closing at least one documented FAIL gap.
hypothesis: Minimal vertical slice wires one citation/provenance export with probe alignment.
acceptance: At least one FAIL gap probe flips PASS; regression suite stays green.
commands: npx tsx --test src/forge-p04-researcher-citation-provenance-graph*.test.ts
blast_radius: src/forge-p04-researcher-citation-provenance-graph*.ts, src/prompts.ts, src/parser.ts
rollback: P04-B05-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B05-A02
last_commit: pending
tests: PASS — forge-p04-researcher-citation-provenance-graph*.test.ts (15/15); validateResearcherCitationProvenanceGraphContract; fixture↔contract alignment gate PASS
evidence: contract v1 23 probes (19 PASS / 4 FAIL); gap=rcpg.researcher_sources_prompt,rcpg.build_research_citation_graph; nogo=rcpg.parser_citation_edges,rcpg.exported_citation_graph_validator
next: P04-B05-A03

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 350/1000
phase_progress: 50/100
block_progress: 0/10
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

P04-B06-A01 — Contradiction ve freshness çözümü: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04-B05-A10 PASS; B06 handoff sealed; citation provenance graph artifacts frozen.
target: Forge contradiction freshness resolution baseline measurement and failing fixture.
hypothesis: Baseline fixture captures measurable gaps from sealed P04-B05 block gate handoff.
acceptance: Baseline loads; probe matrix documents FAIL gaps; fixture validates against B05 handoff contract.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A01 baseline slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B05-A10
last_commit: bbbb9b9
tests: PASS — forge-p04-researcher-citation-provenance-graph*.test.ts (55/55); block gate 10/10 atom seals; handoff→P04-B06; orchestrator verifyForgeResearcherCitationProvenanceGraphBlockGate
evidence: forge-p04-researcher-citation-provenance-graph-block-gate.test.ts + runResearcherCitationProvenanceGraphBlockGate + FORGE_P04_B05_TO_B06_HANDOFF_V1 + orchestrator researcher_citation_provenance_graph_block_gate verification seam
next: P04-B06-A01

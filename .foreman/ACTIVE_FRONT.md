# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B05
active_atom: P04-B05-A10
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 349/1000
phase_progress: 49/100
block_progress: 9/10
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

P04-B05-A09 — Citation ve provenance graph: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P04-B05-A08 PASS; regression integration suite passes; orchestrator verification seam wired.
target: Forge citation provenance graph guard controls (adversarial, performance, cost, safety).
hypothesis: Guard gate validates tampered records, false alignment, summary mismatch and budget ceilings.
acceptance: Guard suite passes; regression gate stays green; adversarial scenarios reject tampered records.
commands: npx tsx --test src/forge-p04-researcher-citation-provenance-graph*.test.ts
blast_radius: src/forge-p04-researcher-citation-provenance-graph*.ts
rollback: P04-B05-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B05-A09
last_commit: 72f89da
tests: PASS — forge-p04-researcher-citation-provenance-graph*.test.ts (48/48); guard adversarial=3/3; performance/cost/safety; orchestrator verifyForgeResearcherCitationProvenanceGraphGuard
evidence: validateForgeResearcherCitationProvenanceGraphGuard + runResearcherCitationProvenanceGraphAdversarialGuardChecks + forge-p04-researcher-citation-provenance-graph.guard.test.ts + orchestrator researcher_citation_provenance_graph_guard verification seam
next: P04-B05-A10

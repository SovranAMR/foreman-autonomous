# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B05
active_atom: P04-B05-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 340/1000
phase_progress: 40/100
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

P04-B05-A01 — Citation ve provenance graph: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04-B04-A10 PASS; block gate sealed with valid P04-B05 handoff contract.
target: Forge citation provenance graph baseline fixture aligned to sealed P04-B04 block gate.
hypothesis: Baseline fixture captures citation/provenance graph probe matrix with measurable FAIL gaps.
acceptance: loadResearcherCitationProvenanceGraphBaseline validates; probe matrix runs with documented gaps.
commands: npx tsx --test src/forge-p04-researcher-citation-provenance-graph*.test.ts
blast_radius: src/forge-p04-researcher-citation-provenance-graph*.ts
rollback: P04-B05-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B04-A10
last_commit: a239828
tests: PASS — forge-p04-researcher-benchmark-prior-art-block-gate.test.ts (7/7); forge-p04-researcher-benchmark-prior-art*.test.ts (48/48); runForgeResearcherBenchmarkPriorArtBlockGate; verifyForgeResearcherBenchmarkPriorArtBlockGate
evidence: block gate seals 10/10 atoms; regression+guard PASS; handoff=PASS→P04-B05 entry=P04-B05-A01
next: P04-B05-A01

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B05
active_atom: P04-B05-A04
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 344/1000
phase_progress: 44/100
block_progress: 4/10
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

P04-B05-A05 — Citation ve provenance graph: failure, recovery ve NO-GO yollarını uygula.

objective: P04-B05-A04 PASS; boundary slice gate wired; 6 boundary probes aligned; zero unexpected mismatches.
target: Forge citation provenance graph failure/recovery slice closing parser/validator NO-GO debt or next failure probes.
hypothesis: Failure/recovery slice extends NO-GO probe matrix gate with zero unexpected mismatches.
acceptance: Failure/recovery probes align PASS; regression suite stays green.
commands: npx tsx --test src/forge-p04-researcher-citation-provenance-graph*.test.ts
blast_radius: src/forge-p04-researcher-citation-provenance-graph*.ts, src/parser.ts
rollback: P04-B05-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B05-A04
last_commit: pending
tests: PASS — forge-p04-researcher-citation-provenance-graph*.test.ts (20/20); runResearcherCitationProvenanceGraphBoundarySlice; 6 boundary probes aligned
evidence: validateResearcherCitationProvenanceGraphBoundaryProbeMatrix + runResearcherCitationProvenanceGraphBoundarySlice; boundary matrix gate zero unexpected mismatches
next: P04-B05-A05

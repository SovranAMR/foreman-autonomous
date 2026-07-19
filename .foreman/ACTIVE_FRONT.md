# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B09
active_atom: P03-B09-A02
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 280/1000
phase_progress: 80/100
block_progress: 1/10
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

P03-B09-A02 — Plan provenance ve drift: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P03-B09-A01 PASS; P03-B09-A02 define typed contract with measurable acceptance criteria.
target: typed contract, category invariants, probe criteria wired to baseline matrix.
hypothesis: P03-B09-A02 formalizes plan provenance/drift contract aligned to A01 baseline handoff.
acceptance: Contract loads; coverage validates; fixture aligns with contract probes.
commands: npx tsx --test src/forge-p03-strategist-provenance*.test.ts
blast_radius: src/forge-p03-strategist-provenance.ts
rollback: P03-B09-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Contract blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B09-A01
last_commit: 83e9d89
tests: PASS — forge-p03-strategist-provenance-baseline.test.ts (3/3); loadStrategistProvenanceBaseline; runStrategistProvenanceProbes; validateStrategistProvenanceBaseline
evidence: runStrategistProvenanceProbes; getForgeP03B08ToB09Handoff; summarizeStrategistProvenanceMatrix; listStrategistProvenanceKnownGaps
next: P03-B09-A02

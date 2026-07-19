# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B09
active_atom: P03-B09-A03
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 281/1000
phase_progress: 81/100
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

P03-B09-A03 — Plan provenance ve drift: en küçük üretim dikey dilimini uygula.

objective: P03-B09-A02 PASS; P03-B09-A03 implement smallest production vertical slice.
target: production slice, validatePlanDrift or planProvenance seam wiring.
hypothesis: P03-B09-A03 closes at least one documented FAIL gap from A02 contract.
acceptance: Production slice runs; at least one gap probe flips PASS or slice validates.
commands: npx tsx --test src/forge-p03-strategist-provenance*.test.ts
blast_radius: src/forge-p03-strategist-provenance.ts, src/parser.ts, src/orchestrator.ts
rollback: P03-B09-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B09-A02
last_commit: f02c308
tests: PASS — forge-p03-strategist-provenance.test.ts (9/9); forge-p03-strategist-provenance-baseline.test.ts (3/3)
evidence: FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1; summarizeStrategistProvenanceCoverage; validateStrategistProvenanceAgainstContract
next: P03-B09-A03

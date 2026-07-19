# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B03
active_atom: P04-B03-A02
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 321/1000
phase_progress: 21/100
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

P04-B03-A02 — Web ve primary-source araştırma: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P04-B03-A01 PASS; define typed contract with measurable acceptance criteria for web and primary-source research.
target: Typed contract v1, probe criteria wiring, fixture↔contract alignment gate.
hypothesis: Documented FAIL gap (recoverWebPrimarySourceEvidence) provides stable contract entry for production slice.
acceptance: contract loads; criteria wired; fixture aligned; A01 baseline remains valid.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-web-primary-source*.ts
rollback: P04-B03-A02 contract slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B03-A01
last_commit: ef04257
tests: PASS — forge-p04-researcher*.test.ts (120/120); baseline fixture v1; probes=23; documented FAIL gap=rwps.structured_web_primary_source_recovery
evidence: loadResearcherWebPrimarySourceBaseline; runResearcherWebPrimarySourceProbes; validateWebPrimarySourceCollection; forge-p04-researcher-web-primary-source-baseline.test.ts
next: P04-B03-A02

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B09
active_atom: P03-B09-A09
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 287/1000
phase_progress: 87/100
block_progress: 8/10
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

P03-B09-A09 — Plan provenance ve drift: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P03-B09-A08 PASS; P03-B09-A09 implement guard controls for provenance probe matrix.
target: adversarial tamper rejection, performance/cost/safety guard metrics on provenance run records.
hypothesis: P03-B09-A09 closes guard category with zero adversarial bypasses.
acceptance: Guard checks reject tampered records; performance/cost/safety within controls.
commands: npx tsx --test src/forge-p03-strategist-provenance*.test.ts
blast_radius: src/forge-p03-strategist-provenance.ts
rollback: P03-B09-A09 guard control değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B09-A08
last_commit: 9fe47e3
tests: PASS — forge-p03-strategist-provenance.test.ts (39/39); forge-p03-strategist-provenance-baseline.test.ts (3/3)
evidence: runStrategistProvenanceForgeRegression; runForgeStrategistProvenanceRegressionGate; detectStrategistProvenanceProbeRegression (28/28 probes aligned, prior/current drift rejected)
next: P03-B09-A09

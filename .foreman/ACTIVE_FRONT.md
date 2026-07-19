# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B05
active_atom: P03-B05-A01
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 239/1000
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

P03-B05-A01 — Risk ve reversibility planı: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-B04-A10 PASS; P03-B05-A01 measure risk/reversibility behavior and create failing baseline fixture.
target: loadStrategistRiskReversibilityBaseline, validateStrategistRiskReversibilityBaseline.
hypothesis: P03-B05-A01 establishes measurable baseline debt from sealed P03-B04 dependency DAG block gate.
acceptance: baseline fixture loads; validation exposes documented FAIL gaps; links to P03-B04 handoff.
commands: npx tsx --test src/forge-p03-strategist-risk-reversibility*.test.ts
blast_radius: src/forge-p03-strategist-risk-reversibility.ts
rollback: P03-B05-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B04-A10
last_commit: 1c7dbc7
tests: PASS — forge-p03-strategist-dependency-dag.test.ts (43/43); forge-p03-strategist-dependency-dag-baseline.test.ts (3/3); forge-p03-strategist-dependency-dag-block-gate.test.ts (7/7); harness 1.0.0-a10
evidence: sealStrategistDependencyDagBlockGate; getForgeP03B04ToB05Handoff
next: P03-B05-A01

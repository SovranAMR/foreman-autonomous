# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B08
active_atom: P03-B08-A04
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 272/1000
phase_progress: 73/100
block_progress: 3/10
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

P03-B08-A04 — Replan ve plan repair: boundary ve edge-case davranışlarını tamamla.

objective: P03-B08-A03 PASS; P03-B08-A04 complete boundary and edge-case replan behaviors.
target: assessStrategistReplanInputBoundary edge probes, replan boundary slice.
hypothesis: P03-B08-A04 extends A03 production slice with full boundary category coverage.
acceptance: boundary probe matrix PASS; regression suite green.
commands: npx tsx --test src/forge-p03-strategist-replan*.test.ts
blast_radius: src/forge-p03-strategist-replan.ts
rollback: P03-B08-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B08-A03
last_commit: 056b22a
tests: PASS — forge-p03-strategist-replan.test.ts (11/11); forge-p03-strategist-replan-baseline.test.ts (3/3); validateStrategistReplan; runStrategistReplanProductionSlice; 28/28 probes aligned
evidence: validateStrategistReplan; parseReplanBlockRefs; orchestrator replan gate + replanCheckpoint/replanLineage; REPLAN PLAN prompt/parser
next: P03-B08-A04

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B08
active_atom: P03-B08-A05
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 273/1000
phase_progress: 74/100
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

P03-B08-A05 — Replan ve plan repair: failure, recovery ve NO-GO yollarını uygula.

objective: P03-B08-A04 PASS; P03-B08-A05 implement failure/recovery/NO-GO replan paths.
target: failure_path, recovery_path, nogo_path probes, replan failure-recovery slice.
hypothesis: P03-B08-A05 extends A04 boundary slice with full failure/recovery category coverage.
acceptance: failure-recovery probe matrix PASS; regression suite green.
commands: npx tsx --test src/forge-p03-strategist-replan*.test.ts
blast_radius: src/forge-p03-strategist-replan.ts
rollback: P03-B08-A05 failure-recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Failure-recovery slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B08-A04
last_commit: pending
tests: PASS — forge-p03-strategist-replan.test.ts (17/17); forge-p03-strategist-replan-baseline.test.ts (3/3); assessStrategistReplanInputBoundary edge cases; runStrategistReplanBoundarySlice; 6/6 boundary probes aligned
evidence: validateStrategistReplanBoundaryProbeMatrix; runStrategistReplanBoundarySlice; assessStrategistReplanInputBoundary empty/whitespace/null-byte/truncation
next: P03-B08-A05

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B08
active_atom: P03-B08-A09
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 277/1000
phase_progress: 77/100
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

P03-B08-A09 — Replan ve plan repair: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P03-B08-A08 PASS; P03-B08-A09 implement adversarial guard checks for replan evidence slice.
target: adversarial guard scenarios, performance/cost/safety validation.
hypothesis: P03-B08-A09 extends A08 regression with guard controls rejecting tampered records.
acceptance: Guard checks PASS; adversarial scenarios rejected.
commands: npx tsx --test src/forge-p03-strategist-replan*.test.ts
blast_radius: src/forge-p03-strategist-replan.ts
rollback: P03-B08-A09 guard değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Guard blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B08-A08
last_commit: ae9701f
tests: PASS — forge-p03-strategist-replan*.test.ts (38/38); runStrategistReplanForgeRegression; detectStrategistReplanProbeRegression; runForgeStrategistReplanRegressionGate
evidence: runStrategistReplanForgeRegression; detectStrategistReplanProbeRegression; validateStrategistReplanProbeRegression; runForgeStrategistReplanRegressionGate
next: P03-B08-A09

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B03
active_atom: P03-B03-A09
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 227/1000
phase_progress: 28/100
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

P03-B03-A09 — Atomization ve atom boyutu: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P03-B03-A08 PASS; P03-B03-A09 add guard controls with adversarial, performance, cost and safety validation for atomization slice.
target: ForgeStrategistAtomizationGuardControls, adversarial guard scenarios, validateForgeStrategistAtomizationGuard.
hypothesis: P03-B03-A09 hardens atomization block with guard gate before block seal handoff.
acceptance: guard slice PASS; adversarial scenarios reject tampered records; performance/cost/safety within bounds.
commands: npx tsx --test src/forge-p03-strategist-atomization*.test.ts
blast_radius: src/forge-p03-strategist-atomization.ts
rollback: P03-B03-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: guard closure blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B03-A08
last_commit: 6043f2e
tests: PASS — forge-p03-strategist-atomization*.test.ts (35/35); regression 24/24 aligned; zero probe regressions; property/fuzz slices green
evidence: runStrategistAtomizationForgeRegression; detectStrategistAtomizationProbeRegression; runStrategistAtomizationProductionSlice; runStrategistAtomizationPropertyFuzzSlice
next: P03-B03-A09

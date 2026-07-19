# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B02
active_atom: P03-B02-A09
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 217/1000
phase_progress: 18/100
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

P03-B02-A09 — Block üretim kontratı: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P03-B02-A08 PASS; P03-B02-A09 guard controls slice for block contract probes.
target: runStrategistBlockContractAdversarialGuardChecks, validateForgeStrategistBlockContractGuard.
hypothesis: P03-B02-A09 closes adversarial/performance/cost/safety gates on block contract matrix.
acceptance: guard checks PASS; adversarial scenarios rejected; performance/cost/safety within bounds.
commands: npx tsx --test src/forge-p03-strategist-block-contract.test.ts
blast_radius: src/forge-p03-strategist-block-contract.ts
rollback: P03-B02-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: A08 regression misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B02-A08
last_commit: ca89ed0
tests: PASS — forge-p03-strategist-block-contract.test.ts (32/32); regression 23/23 aligned; zero probe regressions
evidence: runStrategistBlockContractForgeRegression; detectStrategistBlockContractProbeRegression
next: P03-B02-A09

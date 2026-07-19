# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B03
active_atom: P02-B03-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 127/1000
phase_progress: 27/100
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

P02-B03-A09 — Ürün vizyonu sentezi: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P02-B03-A08 regression integration sealed; B03 guard/adversarial slice next.
target: Extend synthesis guard controls with dedicated guard test suite and orchestrator verification seam.
hypothesis: A08 guard foundation enables stable A09 adversarial/perf/cost/safety gate without scope creep.
acceptance: guard slice validates synthesis run record with zero guard issues on canonical matrix.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-synthesis.ts, src/forge-p02-visioner-synthesis.probe.ts
rollback: P02-B03-A09 guard değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A08
last_commit: pending
tests: PASS — forge-pipeline-regression.integration.test.ts synthesis A08 (5/5); forge-p02-visioner-synthesis*.test.ts (34/34); forge-p02-*.test.ts (120/120)
evidence: runForgeVisionerSynthesisRegressionGate passed=true 23/23 probes aligned propertyFuzz=allPassed guard=adversarial=3/3 orchestrator phase=visioner_synthesis_regression; harnessVersion=1.0.0-a08
next: P02-B03-A09

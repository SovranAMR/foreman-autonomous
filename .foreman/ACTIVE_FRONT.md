# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B06
active_atom: P02-B06-A09
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 157/1000
phase_progress: 56/100
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

P02-B06-A09 — Uncertainty ve clarification policy: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P02-B06-A08 integration regression sealed; guard controls next.
target: Implement validateForgeVisionerUncertaintyGuard and wire into regression gate + guard test suite.
hypothesis: grounding/research-trigger guard pattern ports to uncertainty without orchestrator seam changes.
acceptance: guard.test.ts PASS; regression gate includes guard metrics; adversarial scenarios rejected.
commands: npx tsx --test src/forge-p02-visioner-uncertainty.guard.test.ts
blast_radius: src/forge-p02-visioner-uncertainty*, src/forge-p02-visioner-uncertainty.probe.ts
rollback: P02-B06-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: guard requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B06-A08
last_commit: 7fb076f
tests: PASS — forge-pipeline-regression.integration.test.ts (79/79); uncertainty unit (24/24); property-fuzz (5/5)
evidence: detectVisionerUncertaintyProbeRegression flags aligned→misaligned probes; runForgeVisionerUncertaintyRegressionGate 23/23 aligned with productionSlice unexpected=0 and propertyFuzz PASS; prior-record comparison hasRegression=false; zero unexpected mismatches preserved
next: P02-B06-A09

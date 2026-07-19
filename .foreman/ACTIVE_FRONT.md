# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B07
active_atom: P02-B07-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 168/1000
phase_progress: 67/100
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

P02-B07-A10 — Alternative vision production slice: block gate evidence seal and next block handoff.

objective: P02-B07-A09 guard PASS; seal B07 block gate.
target: Seal P02-B07 block gate with evidence artifact and handoff to P02-B08.
hypothesis: block gate aggregates A01–A09 gates into sealed handoff contract.
acceptance: forge-p02-visioner-alternative block gate slice PASS (A10 tests when added).
commands: npx tsx --test src/forge-p02-visioner-alternative-block-gate.test.ts
blast_radius: src/forge-p02-visioner-alternative*
rollback: P02-B07-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: block gate requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B07-A09
last_commit: 2a05485
tests: PASS — forge-p02-visioner-alternative.guard.test.ts (8/8); forge-p02-visioner-alternative*.test.ts (40/40); forge-pipeline-regression.integration.test.ts (84/84)
evidence: validateForgeVisionerAlternativeGuard (adversarial 3/3, perf/cost/safety bounds); verifyForgeVisionerAlternativeGuard emits visioner_alternative_guard
next: P02-B07-A10

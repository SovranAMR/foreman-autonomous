# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 138/1000
phase_progress: 38/100
block_progress: 9/10
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

P02-B04-A10 — Repo ve kullanıcı bağlamı grounding: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P02-B04-A09 guard gate sealed; block gate evidence next.
target: Seal P02-B04 block gate with grounded evidence artifact and P02-B05 handoff baseline.
hypothesis: A09 guard controls plus sealed block gate provide stable handoff to research trigger block.
acceptance: block gate PASS; sealed evidence artifact; handoff fixture ready; regression suite green.
commands: npx tsx --test src/forge-p02-visioner-grounding-block-gate.test.ts
blast_radius: src/forge-p02-visioner-grounding-block-gate.test.ts
rollback: P02-B04-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: block gate requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A09
last_commit: 873dc92
tests: PASS — forge-p02-visioner-grounding.guard.test.ts (8/8); forge-p02-visioner-grounding*.test.ts (37/37 total)
evidence: validateForgeVisionerGroundingGuard; runVisionerGroundingAdversarialGuardChecks 3/3 rejected; adversarial/perf/cost/safety guard PASS; orchestrator verifyForgeVisionerGroundingGuard visioner_grounding_guard verification
next: P02-B04-A10

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 178/1000
phase_progress: 77/100
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

P02-B08-A10 — Vision scoring block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P02-B08-A09 guard PASS; seal B08 block gate with full suite and B09 handoff.
target: runForgeVisionerScoringBlockGate and forge-p02-visioner-scoring-block-gate.test.ts.
hypothesis: A09 guard suite enables A10 block gate seal without contract refactor.
acceptance: forge-p02-visioner-scoring-block-gate.test.ts; orchestrator verifyForgeVisionerScoringBlockGate.
commands: npx tsx --test src/forge-p02-visioner-scoring-block-gate.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: block gate requires scoring contract refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A09
last_commit: 95bd33e
tests: PASS — forge-p02-visioner-scoring.guard.test.ts (8/8)
evidence: validateForgeVisionerScoringGuard adversarial=3/3; perf/cost/safety; orchestrator verifyForgeVisionerScoringGuard visioner_scoring_guard
next: P02-B08-A10

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 148/1000
phase_progress: 48/100
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

P02-B05-A10 — Research trigger belirleme: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P02-B05-A09 guard integration sealed; block gate slice next.
target: Seal P02-B05 block gate with full atom inventory and B06 handoff.
hypothesis: runForgeVisionerResearchTriggerBlockGate and verifyForgeVisionerResearchTriggerBlockGate provide stable block gate entry points.
acceptance: block gate test passes; all 10 atom seals PASS; handoff to P02-B06 documented.
commands: npx tsx --test src/forge-p02-visioner-research-trigger-block-gate.test.ts
blast_radius: src/forge-p02-visioner-research-trigger*, src/orchestrator.ts
rollback: P02-B05-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: block gate requires unrelated orchestrator refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A09
last_commit: 554821f
tests: PASS — forge-pipeline-regression.integration.test.ts P02-B05-A09 (2/2); forge-p02-visioner-research-trigger.guard.test.ts (8/8)
evidence: validateForgeVisionerResearchTriggerGuard adversarial=3/3; orchestrator visioner_research_trigger_guard verification; guard perf/cost/safety checks PASS
next: P02-B05-A10

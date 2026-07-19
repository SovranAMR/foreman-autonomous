# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A06
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 144/1000
phase_progress: 44/100
block_progress: 5/10
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

P02-B05-A06 — Research trigger belirleme: evidence, telemetry ve provenance kaydını ekle.

objective: P02-B05-A05 failure/recovery slice sealed; evidence slice next.
target: Add evidence, telemetry and provenance run record for visioner research trigger probes.
hypothesis: runVisionerResearchTriggerFailureRecoverySlice and validateVisionerResearchTriggerFailureRecoveryProbeMatrix provide stable entry for evidence slice.
acceptance: run record validates; disposition/criterion wired; failure/recovery probes green in record gate.
commands: npx tsx --test src/forge-p02-visioner-research-trigger.test.ts
blast_radius: src/forge-p02-visioner-research-trigger*
rollback: P02-B05-A06 evidence değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: evidence slice requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A05
last_commit: 8c8950a
tests: PASS — forge-p02-visioner-research-trigger.test.ts (24/24); forge-p02-visioner-research-trigger-baseline.test.ts (3/3)
evidence: validateVisionerResearchTriggerFailureRecoveryProbeMatrix; runVisionerResearchTriggerFailureRecoverySlice; failure/recovery/NO-GO probes 6/6 passAligned; FORGE_VISIONER_RESEARCH_TRIGGER_VERSION 1.0.0-a05; vrtr.malformed_vision_trigger_guard + vrtr.structured_research_trigger_recovery + vrtr.visioner_research_budget_threshold aligned
next: P02-B05-A06

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A07
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 145/1000
phase_progress: 45/100
block_progress: 6/10
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

P02-B05-A07 — Research trigger belirleme: unit, property ve fuzz doğrulamasını ekle.

objective: P02-B05-A06 evidence slice sealed; property/fuzz slice next.
target: Add unit, property and fuzz validation for visioner research trigger run records.
hypothesis: validateVisionerResearchTriggerRunRecord and validateVisionerResearchTriggerFailureRecoveryRunRecord provide stable entry for property/fuzz slice.
acceptance: property checks pass; fuzz rejects tampered records; failure/recovery probes green in record gate.
commands: npx tsx --test src/forge-p02-visioner-research-trigger.test.ts
blast_radius: src/forge-p02-visioner-research-trigger*
rollback: P02-B05-A07 property/fuzz değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: property slice requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A06
last_commit: PENDING
tests: PASS — forge-p02-visioner-research-trigger.test.ts (27/27); forge-p02-visioner-research-trigger-baseline.test.ts (3/3)
evidence: validateVisionerResearchTriggerFailureRecoveryRunRecord; runVisionerResearchTriggerFailureRecoverySliceWithRecord; runVisionerResearchTriggerProbesWithRecord; failure/recovery/NO-GO probes 6/6 aligned in record gate; FORGE_VISIONER_RESEARCH_TRIGGER_VERSION 1.0.0-a06; vrtr.malformed_vision_trigger_guard + vrtr.structured_research_trigger_recovery + vrtr.visioner_research_budget_threshold disposition/criterion wired
next: P02-B05-A07

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 146/1000
phase_progress: 46/100
block_progress: 7/10
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

P02-B05-A08 — Research trigger belirleme: Forge entegrasyonu ile regression testini tamamla.

objective: P02-B05-A07 property/fuzz slice sealed; regression integration slice next.
target: Wire visioner research trigger property/fuzz gates into Forge regression integration harness.
hypothesis: runVisionerResearchTriggerPropertyChecks and runVisionerResearchTriggerRunRecordFuzzValidation provide stable regression entry points.
acceptance: regression integration test passes; property/fuzz probes green in record gate.
commands: npx tsx --test src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-pipeline-regression.integration.test.ts, src/forge-p02-visioner-research-trigger*
rollback: P02-B05-A08 regression integration değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: regression harness requires unrelated orchestrator refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A07
last_commit: ceb4f71
tests: PASS — forge-p02-visioner-research-trigger.test.ts (27/27); forge-p02-visioner-research-trigger.property-fuzz.test.ts (5/5); forge-p02-visioner-research-trigger-baseline.test.ts (3/3)
evidence: runVisionerResearchTriggerPropertyChecks (8/8); runVisionerResearchTriggerFuzzValidation (72/72 rejected); runVisionerResearchTriggerRunRecordFuzzValidation failure/recovery 5/5 + full 3/3; FORGE_VISIONER_RESEARCH_TRIGGER_VERSION 1.0.0-a07
next: P02-B05-A08

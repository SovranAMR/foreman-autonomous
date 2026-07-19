# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B06
active_atom: P02-B06-A08
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 156/1000
phase_progress: 55/100
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

P02-B06-A08 — Uncertainty ve clarification policy: Forge entegrasyonu ile regression testini tamamla.

objective: P02-B06-A07 property/fuzz slice sealed; Forge integration regression next.
target: Wire visioner uncertainty probe regression detection into forge-pipeline-regression integration suite.
hypothesis: runVisionerUncertaintyProbesWithRecord + detectVisionerUncertaintyProbeRegression enable A08 slice without orchestrator refactor.
acceptance: integration regression gates pass; zero unexpected mismatches preserved; probe regression detection verified.
commands: npx tsx --test src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-p02-visioner-uncertainty*, src/forge-pipeline-regression.integration.test.ts
rollback: P02-B06-A08 integration slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: integration requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B06-A07
last_commit: pending
tests: PASS — forge-p02-visioner-uncertainty.property-fuzz.test.ts (5/5); unit (24/24); baseline (3/3)
evidence: runVisionerUncertaintyPropertyChecks (8 structural properties); runVisionerUncertaintyFuzzValidation (72 fixture mutations rejected); runVisionerUncertaintyRunRecordFuzzValidation (failure/recovery 5/5 + full 3/3 tamper rejections); zero unexpected mismatches preserved
next: P02-B06-A08

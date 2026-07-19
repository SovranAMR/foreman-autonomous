# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B09
active_atom: P01-B09-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 86/1000
phase_progress: 85/100
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

P01-B09-A08 — Orchestrator seam ve modülerleşme: Forge entegrasyonu ile regression testini tamamla.

objective: A07 property/fuzz gates sealed; forge-orchestrator-seam regression integration with sealed B08 handoff.
target: forge-orchestrator-seam regression integration test; runOrchestratorSeamProductionSlice wired to forge pipeline.
hypothesis: A07 property/fuzz coverage + A06 run record sufficient for regression integration gate.
acceptance: regression integration test pass; zero unexpected probe mismatches on production slice.
commands: npx tsx --test src/forge-orchestrator-seam*.test.ts src/forge-pipeline-regression.integration.test.ts
blast_radius: forge-orchestrator-seam*.ts, forge-pipeline-regression.integration.test.ts
rollback: A08 regression integration değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A07 property/fuzz invalid ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B09-A07
last_commit: 9cf4561
tests: PASS — forge-orchestrator-seam*.test.ts (23/23); propertyChecks=8; fixtureFuzz=72/72 rejected; runRecordFuzz=8/8 rejected
evidence: runOrchestratorSeamPropertyChecks; runOrchestratorSeamFuzzValidation; runOrchestratorSeamRunRecordFuzzValidation in forge-orchestrator-seam.ts
next: P01-B09-A08

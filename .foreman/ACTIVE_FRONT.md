# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B10
active_atom: P01-B10-A08
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 96/1000
phase_progress: 95/100
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

P01-B10-A08 — Entegre Forge baseline gate: Forge entegrasyonu ile regression testini tamamla.

objective: A07 property/fuzz slice sealed; Forge integration regression for integrated baseline gate.
target: verifyForgeIntegratedBaselineRegression + orchestrator wiring.
hypothesis: A07 property/fuzz + contract probes sufficient for integration regression slice.
acceptance: integrated baseline regression test passes against sealed fixture and contract.
commands: npx tsx --test src/forge-integrated-baseline*.test.ts src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-integrated-baseline.ts, src/orchestrator.ts
rollback: B10-A08 integration regression slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A07 property checks fail ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B10-A07
last_commit: pending
tests: PASS — forge-integrated-baseline*.test.ts (23/23); runIntegratedBaselinePropertyChecks (8/8); runIntegratedBaselineFuzzValidation; runIntegratedBaselineRunRecordFuzzValidation; tampered fixture/run record mutations rejected
evidence: runIntegratedBaselinePropertyChecks, runIntegratedBaselineFuzzValidation, runIntegratedBaselineRunRecordFuzzValidation, contract-wired A07 property/fuzz vertical slice gate
next: P01-B10-A08

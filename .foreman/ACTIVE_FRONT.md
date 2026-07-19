# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B10
active_atom: P01-B10-A10
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 98/1000
phase_progress: 97/100
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

P01-B10-A10 — Entegre Forge baseline gate: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: A09 integrated guard sealed; Forge integrated block gate for P01 phase seal and P02 handoff.
target: verifyForgeIntegratedBlockGate + validateForgeIntegratedBaselineBlockGate.
hypothesis: A09 guard + A08 regression sufficient foundation for integrated block gate slice.
acceptance: integrated block gate passes against sealed fixture and contract with full P01 block inventory.
commands: npx tsx --test src/forge-integrated-baseline*.test.ts
blast_radius: src/forge-integrated-baseline.ts, src/orchestrator.ts
rollback: B10-A10 block gate slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: A09 guard fails ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B10-A09
last_commit: pending
tests: PASS — forge-integrated-baseline*.test.ts (74/74); forge-pipeline-regression.integration.test.ts P01-B10-A09 (2/2); validateForgeIntegratedBaselineGuard; verifyForgeIntegratedGuard orchestrator wiring
evidence: validateForgeIntegratedBaselineGuard adversarial=3/3; runForgeIntegratedBaselineRegressionGate guard PASS; verifyForgeIntegratedGuard emits integrated_baseline_guard verification; ibase.integrated_guard_orchestrator sealed PASS
next: P01-B10-A10

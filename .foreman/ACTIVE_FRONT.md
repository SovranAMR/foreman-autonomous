# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A10
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 9/1000
phase_progress: 9/100
block_progress: 9/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-18

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

P01-B01-A10 — Mission ve acceptance contract: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P01-B01 block gate kanıtını mühürle; B02 handoff baseline'ını hazırla.
target: Block gate suite + handoff contract.
hypothesis: A01–A09 tamamlandı; block gate A10'da mühürlenir.
acceptance: Block gate PASS + handoff kanıtı + regression PASS.
commands: A10 kapsamında belirlenecek.
blast_radius: A10 kapsamında belirlenecek tek seam.
rollback: A10 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: gate seçilemezse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A09
last_commit: 544ef6e
tests: PASS — forge-baseline-contract.guard (8/8), forge-pipeline-regression.integration (4/4), forge-pipeline-baseline (3/3), forge-baseline-contract (8/8), forge-baseline-contract.property-fuzz (4/4)
evidence: validateForgeBaselineGuard (adversarial/perf/cost/safety), runForgeBaselineRegressionGate guard integration, Orchestrator.verifyForgeBaselineGuard emits baseline_guard verification
next: P01-B01-A10

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B02
active_atom: P05-B02-A09
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 417/1000
phase_progress: 15/100
block_progress: 8/10
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

P05-B02-A09 — Filesystem okuma ve grounding: adversarial, performance, cost ve safety kontrolünü geçir.

objective: P05-B02-A08 integration slice sealed; guard controls per contract.
target: Extend production grounding paths with adversarial/perf/cost/safety guard slice per contract categories.
hypothesis: Guard slice closes remaining regression gaps without regressing A08 integration wiring.
acceptance: Guard probes align with contract; zero unexpected PASS mismatches on sealed criteria.
commands: npx tsx --test src/forge-p05-worker-filesystem-grounding*.test.ts
blast_radius: src/forge-p05-worker-filesystem-grounding.ts, src/tools.ts, src/orchestrator.ts
rollback: P05-B02-A09 guard slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Guard slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B02-A08
last_commit: 1eb1f65
tests: PASS — forge-p05-worker-filesystem-grounding*.test.ts
evidence: runWorkerFilesystemGroundingIntegrationSlice; validateWorkerFilesystemGroundingIntegrationProbeMatrix; 6 sub-slices aligned; 27/27 probes; propertyFuzz 8/8; contractFuzz 24/24 rejected; runFuzz 5/5 rejected; 0 accepted mutations
next: P05-B02-A09

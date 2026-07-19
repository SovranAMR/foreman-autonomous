# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B02
active_atom: P05-B02-A06
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 414/1000
phase_progress: 12/100
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

P05-B02-A06 — Filesystem okuma ve grounding: evidence, telemetry ve provenance kaydını ekle.

objective: P05-B02-A05 failure/recovery slice sealed; implement evidence, telemetry and provenance recording per contract.
target: Extend production grounding paths with evidence/telemetry/provenance recording per contract categories.
hypothesis: Evidence slice closes remaining observability gaps without regressing A05 failure/recovery wiring.
acceptance: Evidence probes align with contract; zero unexpected PASS mismatches on sealed criteria.
commands: npx tsx --test src/forge-p05-worker-filesystem-grounding*.test.ts
blast_radius: src/forge-p05-worker-filesystem-grounding.ts, src/tools.ts, src/orchestrator.ts
rollback: P05-B02-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Evidence slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B02-A05
last_commit: pending
tests: PASS — forge-p05-worker-filesystem-grounding*.test.ts (33/33)
evidence: runWorkerFilesystemGroundingFailureRecoverySlice; validateWorkerFilesystemGroundingFailureRecoveryProbeMatrix; failure_path + recovery_path + nogo_path; 7 failure/recovery probes, 0 FAIL gaps
next: P05-B02-A06

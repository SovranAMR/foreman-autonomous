# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B02
active_atom: P05-B02-A05
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 413/1000
phase_progress: 11/100
block_progress: 4/10
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

P05-B02-A05 — Filesystem okuma ve grounding: failure, recovery ve NO-GO yollarını uygula.

objective: P05-B02-A04 boundary slice sealed; implement failure, recovery and NO-GO paths aligned to contract.
target: Extend production grounding paths with failure/recovery/NO-GO handling per contract categories.
hypothesis: Failure/recovery slice closes remaining path gaps without regressing A04 boundary wiring.
acceptance: Failure/recovery probes align with contract; zero unexpected PASS mismatches on sealed criteria.
commands: npx tsx --test src/forge-p05-worker-filesystem-grounding*.test.ts
blast_radius: src/forge-p05-worker-filesystem-grounding.ts, src/tools.ts, src/orchestrator.ts
rollback: P05-B02-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Failure/recovery slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B02-A04
last_commit: PENDING
tests: PASS — forge-p05-worker-filesystem-grounding*.test.ts (28/28)
evidence: assessFilesystemReadLineRangeBoundary + normalizeFilesystemGroundingPath; boundary trim/backslash/line-range; runWorkerFilesystemGroundingBoundarySlice; 7 boundary probes, 0 FAIL gaps
next: P05-B02-A05

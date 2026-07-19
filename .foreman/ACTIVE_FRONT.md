# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B02
active_atom: P05-B02-A04
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 412/1000
phase_progress: 10/100
block_progress: 3/10
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

P05-B02-A04 — Filesystem okuma ve grounding: boundary ve edge-case davranışlarını tamamla.

objective: P05-B02-A03 production slice sealed; complete boundary and edge-case filesystem grounding behavior.
target: Extend production grounding paths with boundary coverage and edge-case handling aligned to contract.
hypothesis: Boundary slice closes remaining edge-case gaps without regressing A03 production wiring.
acceptance: Boundary probes align with contract; zero unexpected PASS mismatches on sealed criteria.
commands: npx tsx --test src/forge-p05-worker-filesystem-grounding*.test.ts
blast_radius: src/forge-p05-worker-filesystem-grounding.ts, src/tools.ts, src/orchestrator.ts
rollback: P05-B02-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Boundary slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B02-A03
last_commit: f2669ec
tests: PASS — forge-p05-worker-filesystem-grounding*.test.ts (21/21)
evidence: validateReadBeforeEdit + validateFilesystemGrounding + buildFilesystemGroundingTelemetry; TypedReadCall; orchestrator pre-read grounding; 27 probes, 0 FAIL gaps
next: P05-B02-A04

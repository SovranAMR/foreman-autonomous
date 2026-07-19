# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B02
active_atom: P05-B02-A08
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 416/1000
phase_progress: 14/100
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

P05-B02-A08 — Filesystem okuma ve grounding: Forge entegrasyonu ile regression testini tamamla.

objective: P05-B02-A07 property/fuzz slice sealed; wire integration regression per contract.
target: Extend production grounding paths with Forge integration regression per contract categories.
hypothesis: Integration slice closes remaining regression gaps without regressing A07 property/fuzz wiring.
acceptance: Integration probes align with contract; zero unexpected PASS mismatches on sealed criteria.
commands: npx tsx --test src/forge-p05-worker-filesystem-grounding*.test.ts
blast_radius: src/forge-p05-worker-filesystem-grounding.ts, src/tools.ts, src/orchestrator.ts
rollback: P05-B02-A08 integration slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Integration slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B02-A07
last_commit: b73b2db
tests: PASS — forge-p05-worker-filesystem-grounding*.test.ts (45/45)
evidence: runWorkerFilesystemGroundingPropertyFuzzSlice; validateWorkerFilesystemGroundingPropertyProbeMatrix; 8 structural properties, 24 contract fuzz + 5 run-record fuzz mutations rejected, 0 accepted
next: P05-B02-A08

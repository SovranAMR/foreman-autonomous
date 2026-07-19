# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B02
active_atom: P05-B02-A03
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 411/1000
phase_progress: 9/100
block_progress: 2/10
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

P05-B02-A03 — Filesystem okuma ve grounding: en küçük üretim dikey dilimini uygula.

objective: P05-B02-A02 contract sealed; smallest production vertical slice for filesystem read/grounding.
target: Wire typed contract probes into production code paths with measurable acceptance alignment.
hypothesis: Production slice closes at least one documented FAIL gap from P05-B02-A02 contract matrix.
acceptance: Production slice runs contract probes with zero unexpected PASS mismatches on sealed criteria.
commands: npx tsx --test src/forge-p05-worker-filesystem-grounding*.test.ts
blast_radius: src/forge-p05-worker-filesystem-grounding.ts, src/tools.ts, src/prompts.ts
rollback: P05-B02-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B02-A02
last_commit: 5aea64a
tests: PASS — forge-p05-worker-filesystem-grounding*.test.ts (16/16)
evidence: getActiveWorkerFilesystemGroundingContract + validateWorkerFilesystemGroundingAgainstContract; 27 probes, 6 FAIL gaps (3 gap + 3 nogo disposition)
next: P05-B02-A03

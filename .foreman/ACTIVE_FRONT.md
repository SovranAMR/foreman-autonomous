# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B06
active_atom: P02-B06-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 151/1000
phase_progress: 51/100
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

P02-B06-A03 — Uncertainty ve clarification policy: en küçük üretim dikey dilimini uygula.

objective: P02-B06-A02 contract sealed; production recovery slice next.
target: Implement recoverVisionerUncertaintyClarification production slice to close vunc.structured_clarification_recovery gap.
hypothesis: Typed contract from B06-A02 provides stable probe wiring for clarification recovery implementation.
acceptance: recoverVisionerUncertaintyClarification exported; gap probe PASS; zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-visioner-uncertainty.test.ts
blast_radius: src/forge-p02-visioner-uncertainty*, src/orchestrator.ts
rollback: P02-B06-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: recovery requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B06-A02
last_commit: PENDING
tests: PASS — forge-p02-visioner-uncertainty.test.ts (9/9)
evidence: contract declares 8 categories; 23 probes (22 PASS + 1 documented FAIL gap); probe matrix zero unexpected mismatches; fixture ↔ contract aligned
next: P02-B06-A03

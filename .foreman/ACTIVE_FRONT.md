# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A04
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 172/1000
phase_progress: 72/100
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

P02-B08-A04 — Vision scoring boundary slice: boundary ve edge-case davranışlarını tamamla.

objective: P02-B08-A03 production slice PASS; extend scoring input boundary and edge-case coverage.
target: assessVisionerScoringInputBoundary and related guards handle empty, whitespace, oversized and malformed trade-off inputs.
hypothesis: A03 recovery helper enables boundary probes without orchestrator refactor.
acceptance: forge-p02-visioner-scoring boundary tests; probe matrix remains fully aligned.
commands: npx tsx --test src/forge-p02-visioner-scoring.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A04 boundary değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: boundary slice requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A03
last_commit: b1f6f1a
tests: PASS — forge-p02-visioner-scoring.test.ts (12/12), forge-p02-visioner-scoring-baseline.test.ts (3/3)
evidence: recoverVisionerTradeoff production slice; validateVisionerScoringProbeMatrix 23 passAligned + 0 gapAligned; vsco.structured_tradeoff_recovery PASS
next: P02-B08-A04

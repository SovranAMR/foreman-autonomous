# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 171/1000
phase_progress: 70/100
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

P02-B08-A03 — Vision scoring production slice: en küçük üretim dikey dilimini uygula.

objective: P02-B08-A02 contract PASS; implement recoverVisionerTradeoff production slice.
target: recoverVisionerTradeoff restructures failed trade-off parse into actionable scoring input.
hypothesis: A02 contract gap vsco.structured_tradeoff_recovery closes with minimal recovery helper.
acceptance: forge-p02-visioner-scoring production slice; gap probe aligns PASS.
commands: npx tsx --test src/forge-p02-visioner-scoring.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: recoverVisionerTradeoff requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A02
last_commit: 225ad13
tests: PASS — forge-p02-visioner-scoring.test.ts (9/9)
evidence: validateVisionerScoringContractCoverage 23 probes; 22 PASS + 1 documented gap vsco.structured_tradeoff_recovery; probe matrix 22 passAligned + 1 gapAligned
next: P02-B08-A03

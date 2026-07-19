# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A05
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 173/1000
phase_progress: 73/100
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

P02-B08-A05 — Vision scoring failure/recovery slice: failure, recovery ve NO-GO yollarını uygula.

objective: P02-B08-A04 boundary slice PASS; wire failure_path, recovery_path and nogo_path probes.
target: validateVisionerScoringFailureRecoveryProbeMatrix and related guards handle invalid versions, malformed vision, checkpoint recovery and tie-break NO-GO.
hypothesis: A04 boundary helper enables failure/recovery probes without orchestrator refactor.
acceptance: forge-p02-visioner-scoring failure/recovery tests; probe matrix remains fully aligned.
commands: npx tsx --test src/forge-p02-visioner-scoring.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A05 failure/recovery değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: failure/recovery slice requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A04
last_commit: pending
tests: PASS — forge-p02-visioner-scoring.test.ts (21/21), forge-p02-visioner-scoring-baseline.test.ts (3/3)
evidence: validateVisionerScoringBoundaryProbeMatrix 6 passAligned + 0 gapAligned; assessVisionerScoringPresence boundary guard; runVisionerScoringBoundarySlice PASS
next: P02-B08-A05

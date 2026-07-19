# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B08
active_atom: P02-B08-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 169/1000
phase_progress: 68/100
block_progress: 10/10
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

P02-B08-A01 — Vision scoring production slice: measure current behavior and create failing baseline fixture.

objective: P02-B07 block gate PASS; start B08 baseline measurement.
target: Measure vision scoring/trade-off behavior and create failing baseline fixture for P02-B08.
hypothesis: sealed B07 handoff provides alternative artifacts for scoring baseline entry.
acceptance: forge-p02-visioner-scoring baseline slice with failing fixture (when added).
commands: npx tsx --test src/forge-p02-visioner-scoring-baseline.test.ts
blast_radius: src/forge-p02-visioner-scoring*
rollback: P02-B08-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: scoring slice requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B07-A10
last_commit: 6ea96dd
tests: PASS — forge-p02-visioner-alternative-block-gate.test.ts (6/6); forge-p02-visioner-alternative*.test.ts (46/46); forge-pipeline-regression.integration.test.ts (84/84)
evidence: runVisionerAlternativeBlockGate seals P02-B07 with B08 handoff; verifyForgeVisionerAlternativeBlockGate emits visioner_alternative_block_gate
next: P02-B08-A01

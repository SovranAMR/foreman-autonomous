# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B03
active_atom: P02-B03-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 121/1000
phase_progress: 21/100
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

P02-B03-A03 — Ürün vizyonu sentezi: en küçük üretim dikey dilimini uygula.

objective: P02-B03-A02 typed contract sealed; B03 production slice next.
target: Implement smallest production vertical slice wired to typed synthesis contract probes.
hypothesis: A02 contract provides stable probe matrix for extractVisionerSynthesis production wiring.
acceptance: production exports execute contract-wired probes with zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-synthesis.ts
rollback: P02-B03-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A02
last_commit: b48b96f
tests: PASS — forge-p02-visioner-synthesis-baseline.test.ts (3/3); forge-p02-visioner-synthesis.test.ts (7/7); forge-p02-visioner-synthesis*.test.ts (10/10); forge-p02-*.test.ts (96/96)
evidence: getActiveVisionerSynthesisContract atom=P02-B03-A05 probes=23/23 categories=8; validateVisionerSynthesisContractCoverage valid=true; fixture↔contract aligned; knownGaps=1 vsyn.structured_synthesis_recovery
next: P02-B03-A03

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A02
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 131/1000
phase_progress: 31/100
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

P02-B04-A03 — Repo ve kullanıcı bağlamı grounding: en küçük üretim dikey dilimini uygula.

objective: P02-B04-A02 contract sealed; production slice next.
target: Implement minimal recoverVisionerGrounding vertical slice for structured grounding recovery gap.
hypothesis: A02 contract probes provide stable criterion wiring for A03 production slice.
acceptance: recoverVisionerGrounding export exists, gap probe flips to PASS, zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-visioner-grounding*.test.ts
blast_radius: src/forge-p02-visioner-grounding.ts
rollback: P02-B04-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: recoverVisionerGrounding requires orchestrator seam change ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A02
last_commit: pending
tests: PASS — forge-p02-visioner-grounding.test.ts (7/7); forge-p02-visioner-grounding-baseline.test.ts (3/3); forge-p02-*.test.ts (139/139)
evidence: validateVisionerGroundingContractCoverage valid=true; 23 probes 8 categories; gap=vgrd.structured_grounding_recovery; contractAtom=P02-B04-A05
next: P02-B04-A03

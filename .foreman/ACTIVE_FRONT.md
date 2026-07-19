# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B07
active_atom: P02-B07-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 161/1000
phase_progress: 60/100
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

P02-B07-A03 — Alternative vision production slice: apply smallest vertical slice.

objective: P02-B07-A02 contract sealed; production slice next.
target: Implement recoverVisionerAlternatives or equivalent smallest production wiring for valt.structured_alternative_recovery gap.
hypothesis: structured alternative recovery closes documented FAIL gap with contract-aligned probes.
acceptance: forge-p02-visioner-alternative.test.ts production slice PASS.
commands: npx tsx --test src/forge-p02-visioner-alternative.test.ts
blast_radius: src/forge-p02-visioner-alternative*
rollback: P02-B07-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: contract requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B07-A02
last_commit: pending
tests: PASS — forge-p02-visioner-alternative.test.ts (9/9)
evidence: FORGE_VISIONER_ALTERNATIVE_CONTRACT_V1 with 23 probes; valt.structured_alternative_recovery gap probe; contract coverage helpers and probe matrix validation
next: P02-B07-A03

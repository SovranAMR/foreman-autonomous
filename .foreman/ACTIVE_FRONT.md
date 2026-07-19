# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 141/1000
phase_progress: 41/100
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

P02-B05-A03 — Research trigger belirleme: en küçük üretim dikey dilimini uygula.

objective: P02-B05-A02 typed contract sealed; production slice next.
target: Implement smallest production vertical slice for visioner research trigger determination.
hypothesis: A02 contract and probe matrix provide stable entry for recoverVisionerResearchTrigger slice.
acceptance: production slice; recoverVisionerResearchTrigger or equivalent; probe matrix green except documented gaps closed.
commands: npx tsx --test src/forge-p02-visioner-research-trigger.test.ts
blast_radius: src/forge-p02-visioner-research-trigger*
rollback: P02-B05-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A02
last_commit: 0a76169
tests: PASS — forge-p02-visioner-research-trigger.test.ts (9/9); forge-p02-visioner-research-trigger-baseline.test.ts (3/3); forge-p02-visioner-grounding*.test.ts (43/43 regression)
evidence: FORGE_VISIONER_RESEARCH_TRIGGER_CONTRACT_V1; validateVisionerResearchTriggerContractCoverage; validateVisionerResearchTriggerProbeMatrix (22 passAligned, 1 gapAligned); probe criteria wired from contract
next: P02-B05-A03

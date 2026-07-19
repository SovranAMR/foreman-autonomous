# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A02
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 140/1000
phase_progress: 40/100
block_progress: 1/10
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

P02-B05-A02 — Research trigger belirleme: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P02-B05-A01 baseline sealed; typed research trigger contract next.
target: Define measurable acceptance criteria for visioner research trigger determination via typed contract.
hypothesis: A01 probe matrix and documented FAIL gap provide stable contract entry for P02-B05-A02.
acceptance: typed contract v1; fixture-contract alignment; probe matrix criteria wired; baseline test green.
commands: npx tsx --test src/forge-p02-visioner-research-trigger.test.ts
blast_radius: src/forge-p02-visioner-research-trigger*
rollback: P02-B05-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: contract requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A01
last_commit: b276b74
tests: PASS — forge-p02-visioner-research-trigger-baseline.test.ts (3/3); forge-p02-visioner-grounding*.test.ts (43/43 regression)
evidence: runVisionerResearchTriggerProbes; FORGE_VISIONER_RESEARCH_TRIGGER_CONTRACT_V1; vrtr.structured_research_trigger_recovery documented FAIL gap; B04 handoff validated via getForgeP02B04ToB05Handoff
next: P02-B05-A02

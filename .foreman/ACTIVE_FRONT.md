# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A04
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 142/1000
phase_progress: 42/100
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

P02-B05-A04 — Research trigger belirleme: boundary ve edge-case davranışlarını tamamla.

objective: P02-B05-A03 production slice sealed; boundary slice next.
target: Complete boundary and edge-case behavior for visioner research trigger determination.
hypothesis: recoverVisionerResearchTrigger and probe matrix provide stable entry for boundary slice.
acceptance: boundary probes green; input edge cases complete; probe matrix zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-visioner-research-trigger.test.ts
blast_radius: src/forge-p02-visioner-research-trigger*
rollback: P02-B05-A04 boundary değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: boundary slice requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A03
last_commit: 8474ce4
tests: PASS — forge-p02-visioner-research-trigger.test.ts (12/12); forge-p02-visioner-research-trigger-baseline.test.ts (3/3); forge-p02-visioner-grounding*.test.ts regression
evidence: recoverVisionerResearchTrigger; runVisionerResearchTriggerProductionSlice; probe matrix 23/23 passAligned; vrtr.structured_research_trigger_recovery gap closed
next: P02-B05-A04

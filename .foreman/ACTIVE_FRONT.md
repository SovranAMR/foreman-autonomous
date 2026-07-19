# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A05
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 143/1000
phase_progress: 43/100
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

P02-B05-A05 — Research trigger belirleme: failure, recovery ve NO-GO yollarını uygula.

objective: P02-B05-A04 boundary slice sealed; failure/recovery slice next.
target: Implement failure, recovery and NO-GO paths for visioner research trigger determination.
hypothesis: validateVisionerResearchTriggerBoundaryProbeMatrix and runVisionerResearchTriggerBoundarySlice provide stable entry for failure/recovery slice.
acceptance: failure/recovery probes green; documented gaps preserved; probe matrix zero unexpected mismatches.
commands: npx tsx --test src/forge-p02-visioner-research-trigger.test.ts
blast_radius: src/forge-p02-visioner-research-trigger*
rollback: P02-B05-A05 failure/recovery değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: failure slice requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A04
last_commit: pending
tests: PASS — forge-p02-visioner-research-trigger.test.ts (21/21); forge-p02-visioner-research-trigger-baseline.test.ts (3/3)
evidence: validateVisionerResearchTriggerBoundaryProbeMatrix; runVisionerResearchTriggerBoundarySlice; recoverVisionerResearchTrigger empty/whitespace rejection; FORGE_VISIONER_RESEARCH_TRIGGER_VERSION 1.0.0-a04; boundary probe matrix 6/6 passAligned
next: P02-B05-A05

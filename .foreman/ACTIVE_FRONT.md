# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A02
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 101/1000
phase_progress: 1/100
block_progress: 0/10
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

P02-B01-A02 — Intent ve görev anlamlandırma: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P02-B01-A01 baseline sealed; typed intent contract A02 next.
target: visioner intent typed contract + measurable acceptance probes.
hypothesis: A01 failing baseline matrix sufficient to declare A02 contract coverage.
acceptance: typed contract probes declared; contract coverage validation passes.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-intent*.ts
rollback: P02-B01-A02 slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: contract coverage alignment fails ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A01
last_commit: pending
tests: PASS — forge-p02-visioner-intent-baseline.test.ts (3/3); 20 probes 14 PASS + 5 aligned FAIL gaps; validateVisionerIntentBaseline PASS; P01 handoff link PASS
evidence: loadVisionerIntentBaseline v1.0.0 atom P02-B01-A01; runVisionerIntentProbes matrix 20/20 aligned; documented gaps: structured_intent_parse, programmatic_depth_classifier, depth_routed_prompt, structured_intent_recovery, intent_ambiguity_nogo
next: P02-B01-A02

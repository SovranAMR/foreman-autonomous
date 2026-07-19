# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 109/1000
phase_progress: 9/100
block_progress: 9/10
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

P02-B01-A10 — Intent ve görev anlamlandırma: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P02-B01-A09 guard gate sealed; block gate A10 next.
target: visioner intent block gate with full inventory, sealed evidence and P02-B02 handoff.
hypothesis: regression + guard + property/fuzz gates from A01-A09 compose into block gate without scope creep.
acceptance: block gate passes; orchestrator verifyForgeVisionerIntentBlockGate emits verification; full block inventory sealed.
commands: npx tsx --test src/forge-p02-*.test.ts; npx tsx --test src/forge-pipeline-regression.integration.test.ts
blast_radius: src/forge-p02-visioner-intent.ts, src/forge-p02-visioner-intent.probe.ts, src/orchestrator.ts
rollback: P02-B01-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: block gate cannot seal without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A09
last_commit: pending
tests: PASS — forge-p02-visioner-intent.guard.test.ts (8/8); forge-p02-visioner-intent*.test.ts (37/37); forge-pipeline-regression.integration.test.ts P02-B01-A09 (2/2)
evidence: verifyForgeVisionerIntentGuard, validateForgeVisionerIntentGuard canonical matrix adversarial=3/3; orchestrator visioner_intent_guard verification
next: P02-B01-A10

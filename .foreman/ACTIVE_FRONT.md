# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B03
active_atom: P02-B03-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 128/1000
phase_progress: 28/100
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

P02-B03-A10 — Ürün vizyonu sentezi: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P02-B03-A09 guard slice sealed; B03 block gate next.
target: Seal P02-B03 block gate with handoff contract to P02-B04 entry atom.
hypothesis: A09 guard foundation enables stable A10 block gate without scope creep.
acceptance: block gate validates synthesis regression + guard PASS and emits B04 handoff.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-synthesis.ts, src/forge-p02-visioner-synthesis.probe.ts
rollback: P02-B03-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A09
last_commit: 7ef6887
tests: PASS — forge-p02-visioner-synthesis.guard.test.ts (8/8); forge-pipeline-regression.integration.test.ts synthesis A08 (5/5); forge-p02-visioner-synthesis*.test.ts (34/34); forge-p02-*.test.ts (123/123)
evidence: validateForgeVisionerSynthesisGuard passed=true zero guard issues canonical matrix adversarial=3/3 orchestrator phase=visioner_synthesis_guard; harnessVersion=1.0.0-a09
next: P02-B03-A10

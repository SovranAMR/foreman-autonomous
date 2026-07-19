# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 103/1000
phase_progress: 3/100
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

P02-B01-A04 — Intent ve görev anlamlandırma: boundary ve edge-case davranışlarını tamamla.

objective: P02-B01-A03 parse/classify/route slice sealed; boundary slice A04 next.
target: visioner intent boundary probes for edge cases and invalid inputs.
hypothesis: boundary dispositions close remaining edge-case gaps without scope creep.
acceptance: boundary slice probes flip or preserve documented gaps; regression suite passes.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-intent*.ts, src/orchestrator.ts
rollback: P02-B01-A04 boundary değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: boundary slice cannot flip probes without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A03
last_commit: pending
tests: PASS — forge-p02-visioner-intent.test.ts (10/10); forge-p02-visioner-intent-baseline.test.ts (3/3); production slice 18 PASS + 2 gap FAIL; matrixValidation unexpectedMismatches=0
evidence: parseVisionerTaskIntent + classifyVisionerTaskDepth + buildVisionPromptForDepth exported; orchestrator depth-routed vision prompt; 3 gap probes flipped PASS
next: P02-B01-A04

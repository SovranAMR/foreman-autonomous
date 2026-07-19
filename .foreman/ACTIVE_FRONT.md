# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A05
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 104/1000
phase_progress: 4/100
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

P02-B01-A05 — Intent ve görev anlamlandırma: failure, recovery ve NO-GO yollarını uygula.

objective: P02-B01-A04 boundary slice sealed; failure/recovery/NO-GO slice A05 next.
target: visioner intent failure_path, recovery_path and nogo_path probes with preserved gaps.
hypothesis: failure/recovery dispositions close remaining path gaps without scope creep.
acceptance: failure/recovery slice probes flip or preserve documented gaps; regression suite passes.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-intent*.ts, src/orchestrator.ts
rollback: P02-B01-A05 failure/recovery değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: failure/recovery slice cannot flip probes without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A04
last_commit: pending
tests: PASS — forge-p02-visioner-intent.test.ts (13/13); forge-p02-visioner-intent-baseline.test.ts (3/3); boundary slice 6/6 PASS; production slice 22 PASS + 1 gap FAIL; matrixValidation unexpectedMismatches=0
evidence: assessVisionerTaskInputBoundary + checkVisionerIntentAmbiguity exported; orchestrator intent_ambiguity_nogo gate; 3 boundary edge probes; vint.intent_ambiguity_nogo flipped PASS
next: P02-B01-A05

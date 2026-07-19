# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B01
active_atom: P02-B01-A03
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 102/1000
phase_progress: 2/100
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

P02-B01-A03 — Intent ve görev anlamlandırma: en küçük üretim dikey dilimini uygula.

objective: P02-B01-A02 contract sealed; production slice A03 next.
target: visioner intent production exports for parse/classify/route gaps.
hypothesis: typed contract gap probes define minimal production slice scope.
acceptance: production slice probes flip documented gaps; regression suite passes.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-intent*.ts, src/orchestrator.ts
rollback: P02-B01-A03 slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: production slice cannot flip gap probes without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A02
last_commit: pending
tests: PASS — forge-p02-visioner-intent.test.ts (7/7); forge-p02-visioner-intent-baseline.test.ts (3/3); contract coverage 20 probes 15 PASS + 5 gap FAIL
evidence: validateVisionerIntentContractCoverage PASS; validateVisionerIntentAgainstContract PASS; 5 gap dispositions wired; criterion source-of-truth from FORGE_VISIONER_INTENT_CONTRACT_V1
next: P02-B01-A03

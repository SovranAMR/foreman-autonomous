# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B08
active_atom: P03-B08-A02
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 271/1000
phase_progress: 72/100
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

P03-B08-A03 — Replan ve plan repair: en küçük üretim dikey dilimini uygula.

objective: P03-B08-A02 PASS; P03-B08-A03 implement smallest production vertical slice for replan/plan-repair contract gaps.
target: validateStrategistReplan, replan checkpoint wiring.
hypothesis: P03-B08-A03 closes at least one documented FAIL gap from A01 baseline with production code.
acceptance: targeted probe flips PASS; regression suite green.
commands: npx tsx --test src/forge-p03-strategist-replan*.test.ts
blast_radius: src/forge-p03-strategist-replan.ts, src/orchestrator.ts, src/parser.ts
rollback: P03-B08-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Production slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B08-A02
last_commit: pending
tests: PASS — forge-p03-strategist-replan.test.ts (9/9); forge-p03-strategist-replan-baseline.test.ts (3/3); 28 probes; typed contract coverage validated
evidence: getActiveStrategistReplanContract; validateStrategistReplanCoverage; listStrategistReplanProbesByDisposition
next: P03-B08-A03

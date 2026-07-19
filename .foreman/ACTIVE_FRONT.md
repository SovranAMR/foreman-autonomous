# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B01
active_atom: P03-B01-A02
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 200/1000
phase_progress: 1/100
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

P03-B01-A02 — Hedef decomposition: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P03-B01-A01 PASS; P03-B01-A02 typed strategist intent contract acceptance.
target: getActiveStrategistIntentContract, validateStrategistIntentAgainstContract.
hypothesis: P03-B01-A02 formalizes strategist intent probes from sealed P03-B01-A01 baseline.
acceptance: contract coverage validated; fixture aligned; baseline regression green.
commands: npx tsx --test src/forge-p03-strategist-intent-baseline.test.ts
blast_radius: src/forge-p03-strategist-intent.ts
rollback: P03-B01-A02 contract slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: P03-B01-A01 baseline misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B01-A01
last_commit: 233f226
tests: PASS — forge-p03-strategist-intent-baseline.test.ts (3/3); 23 probes; 1 documented FAIL gap
evidence: loadStrategistIntentBaseline; validateStrategistIntentBaseline; runStrategistIntentProbes; handoff=P02-PHASE-GATE→P03-B01-A01
next: P03-B01-A02

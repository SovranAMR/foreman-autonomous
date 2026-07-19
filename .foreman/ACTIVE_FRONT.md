# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B02
active_atom: P03-B02-A01
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 209/1000
phase_progress: 10/100
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

P03-B02-A01 — Block üretim kontratı: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-B01-A10 PASS; P03-B02-A01 block production contract baseline measurement.
target: loadStrategistBlockContractBaseline, runStrategistBlockContractProbes.
hypothesis: P03-B02-A01 establishes measurable block production contract baseline from sealed P03-B01 handoff.
acceptance: versioned baseline fixture; P03-B01 handoff alignment; probe matrix with documented gaps.
commands: npx tsx --test src/forge-p03-strategist-block-contract-baseline.test.ts
blast_radius: src/forge-p03-strategist-block-contract.ts
rollback: P03-B02-A01 baseline fixture değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: P03-B01 handoff misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B01-A10
last_commit: feb6006
tests: PASS — forge-p03-strategist-intent-baseline.test.ts (6/6); forge-p03-strategist-intent.test.ts (34/34); forge-p03-strategist-intent-block-gate.test.ts (6/6); block gate seals 10/10; handoff→P03-B02
evidence: runStrategistIntentBlockGate; getForgeP03B01BlockGate; getForgeP03B01ToB02Handoff
next: P03-B02-A01

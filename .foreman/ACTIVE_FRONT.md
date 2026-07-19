# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B09
active_atom: P03-B09-A01
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 279/1000
phase_progress: 79/100
block_progress: 10/10
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

P03-B09-A01 — Plan provenance ve drift: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-B08-A10 PASS; P03-B09-A01 measure plan provenance/drift and create failing baseline fixture.
target: baseline fixture, probe matrix, documented gaps from sealed P03-B08 block gate.
hypothesis: P03-B09-A01 loads versioned baseline aligned to sealed replan block gate handoff.
acceptance: Baseline loads; probe matrix runs; gaps documented.
commands: npx tsx --test src/forge-p03-strategist-provenance*.test.ts
blast_radius: src/forge-p03-strategist-provenance.ts
rollback: P03-B09-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Baseline fixture blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B08-A10
last_commit: d8d4e11
tests: PASS — forge-p03-strategist-replan*.test.ts (51/51); runStrategistReplanBlockGate; validateStrategistReplanBlockHandoffContract; runForgeStrategistReplanRegressionGate
evidence: runStrategistReplanBlockGate; getForgeP03B08BlockGate; getForgeP03B08ToB09Handoff; verifyForgeStrategistReplanBlockGate
next: P03-B09-A01

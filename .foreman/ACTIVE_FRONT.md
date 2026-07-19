# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B08
active_atom: P03-B08-A01
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 269/1000
phase_progress: 70/100
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

P03-B08-A01 — Replan ve plan repair: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-B07-A10 PASS; P03-B08-A01 measure replan/plan-repair behavior and create failing baseline fixture.
target: loadStrategistReplanBaseline, runStrategistReplanProbes.
hypothesis: P03-B08-A01 establishes measurable replan debt from sealed P03-B07 parallel wave block gate handoff.
acceptance: baseline fixture loads; probes run; documented FAIL gaps aligned to contract.
commands: npx tsx --test src/forge-p03-strategist-replan*.test.ts
blast_radius: src/forge-p03-strategist-replan.ts
rollback: P03-B08-A01 baseline slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B07-A10
last_commit: cdcc923
tests: PASS — forge-p03-strategist-parallel-wave*.test.ts (50/50); block gate 10/10 seals; handoff→P03-B08
evidence: sealStrategistParallelWaveBlockGate; validateStrategistParallelWaveBlockHandoffContract; runForgeStrategistParallelWaveBlockGate
next: P03-B08-A01

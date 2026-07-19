# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B08
active_atom: P03-B08-A02
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 270/1000
phase_progress: 71/100
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

last_atom: P03-B08-A01
last_commit: 34249f4
tests: PASS — forge-p03-strategist-replan-baseline.test.ts (3/3); 28 probes; 6 documented FAIL gaps aligned
evidence: loadStrategistReplanBaseline; runStrategistReplanProbes; validateStrategistReplanBaseline
next: P03-B08-A02

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 370/1000
phase_progress: 69/100
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

P04-B08-A01 — Spike ve falsification deneyi: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04-B07-A10 PASS; block gate 10/10 seals; handoff→P04-B08 sealed.
target: Versioned spike/falsification baseline fixture aligned to P04-B07 block gate handoff with measurable failing probes.
hypothesis: Baseline probes document current spike/falsification behavior gaps against sealed risk trade-off artifacts.
acceptance: Baseline loads; validate passes; probe matrix runs with documented FAIL gaps only.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification-baseline.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts; src/fixtures/forge-researcher-spike-falsification-v1.json
rollback: P04-B08-A01 baseline slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B07-A10
last_commit: pending
tests: PASS — forge-p04-researcher-risk-tradeoff-block-gate.test.ts (7/7); risk-tradeoff suite 61/61; block gate seals=10/10 handoff→P04-B08
evidence: runResearcherRiskTradeoffBlockGate + verifyForgeResearcherRiskTradeoffBlockGate + FORGE_P04_B07_TO_B08_HANDOFF_V1
next: P04-B08-A01

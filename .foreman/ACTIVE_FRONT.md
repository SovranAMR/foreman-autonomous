# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A04
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 373/1000
phase_progress: 72/100
block_progress: 3/10
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

P04-B08-A04 — Spike ve falsification deneyi: boundary ve edge-case davranışlarını tamamla.

objective: P04-B08-A03 PASS; parseResearchSpikeExperiment + validateSpikeFalsificationExperiment wired with zero FAIL gaps.
target: Boundary-category probe matrix for spike falsification input edge cases.
hypothesis: Boundary slice closes remaining edge-case probes without regressing A03 production wiring.
acceptance: Boundary slice tests pass; zero unexpected mismatches on boundary probes.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts
rollback: P04-B08-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A03
last_commit: pending
tests: PASS — forge-p04-researcher-spike-falsification.test.ts (11/11); forge-p04-researcher-spike-falsification-baseline.test.ts (10/10); production slice 23/23 probes zero mismatches
evidence: parseResearchSpikeExperiment + validateSpikeFalsificationExperiment + runResearcherSpikeFalsificationProductionSlice + orchestrator wiring
next: P04-B08-A04

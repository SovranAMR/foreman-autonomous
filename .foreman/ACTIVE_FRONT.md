# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 372/1000
phase_progress: 71/100
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

P04-B08-A03 — Spike ve falsification deneyi: en küçük üretim dikey dilimini uygula.

objective: P04-B08-A02 PASS; typed contract v1 with 23 probes and 2 documented FAIL gaps.
target: Production slice wiring parseResearchSpikeExperiment and validateSpikeFalsificationExperiment exports.
hypothesis: Minimal vertical slice closes documented nogo_path FAIL gaps without regressing baseline probes.
acceptance: Production slice tests pass; documented FAIL gaps reduced or closed with evidence.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts, src/parser.ts
rollback: P04-B08-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A02
last_commit: a9ff86f
tests: PASS — forge-p04-researcher-spike-falsification.test.ts (8/8); contract coverage 23/23 with 2 expected FAIL gaps
evidence: validateResearcherSpikeFalsificationContract + validateResearcherSpikeFalsificationAgainstContract + summarizeResearcherSpikeFalsificationContractCoverage
next: P04-B08-A03

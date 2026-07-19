# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B09-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 380/1000
phase_progress: 79/100
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

P04-B09-A01 — Research-to-worker handoff: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04-B08-A10 PASS; baseline research-to-worker handoff from sealed spike falsification block gate.
target: Measure current research-to-worker handoff behavior and create failing baseline fixture.
hypothesis: Sealed P04-B08 block gate provides probe matrix and handoff contract for B09 baseline.
acceptance: Failing baseline fixture loaded; source block gate refs validated; probe gaps documented.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts
rollback: P04-B09-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A10
last_commit: 2a951cf
tests: PASS — forge-p04-researcher-spike-falsification*.test.ts (65/65); block gate seals=10/10; handoff→P04-B09; orchestrator verifyForgeResearcherSpikeFalsificationBlockGate
evidence: runResearcherSpikeFalsificationBlockGate + FORGE_P04_B08_TO_B09_HANDOFF_V1
next: P04-B09-A01

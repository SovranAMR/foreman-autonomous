# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B09
active_atom: P04-B09-A07
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 386/1000
phase_progress: 85/100
block_progress: 6/10
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

P04-B09-A07 — Research-to-worker handoff: unit, property ve fuzz doğrulamasını ekle.

objective: P04-B09-A06 PASS; evidence slice closes guard-path gaps with auditable run record.
target: Add unit, property and fuzz validation for research-to-worker handoff contract and evidence slice.
hypothesis: A06 evidence/telemetry/provenance record enables A07 property-fuzz gate with contract-wired probes.
acceptance: Property checks hold on contract; fuzz rejects tampered evidence/telemetry/provenance; slice zero mismatches.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts
rollback: P04-B09-A07 property-fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Property-fuzz slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A06
last_commit: d4201de
tests: PASS — forge-p04-researcher-research-to-worker-handoff*.test.ts (36/36); evidence slice 6/6 aligned; unexpectedMismatches=0; recordValid=true
evidence: validateResearcherResearchToWorkerHandoffEvidenceRunRecord + runResearcherResearchToWorkerHandoffEvidenceSlice + failure/recovery/NO-GO probe evidence/telemetry/provenance
next: P04-B09-A07

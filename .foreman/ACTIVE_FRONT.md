# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B09
active_atom: P04-B09-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 387/1000
phase_progress: 85/100
block_progress: 7/10
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

P04-B09-A08 — Research-to-worker handoff: Forge entegrasyonu ile regression testini tamamla.

objective: P04-B09-A07 PASS; property-fuzz slice closes contract/run-record gates with zero accepted mutations.
target: Wire research-to-worker handoff property/fuzz slice into Forge probe regression gate.
hypothesis: A07 property-fuzz slice enables A08 regression probe with contract-wired property checks and fuzz rejection.
acceptance: Property checks hold on contract; fuzz rejects tampered evidence/telemetry/provenance; slice zero accepted mutations.
commands: npx tsx --test src/forge-p04-researcher-research-to-worker-handoff*.test.ts
blast_radius: src/forge-p04-researcher-research-to-worker-handoff*.ts
rollback: P04-B09-A08 regression probe değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Regression probe blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B09-A07
last_commit: 2061191
tests: PASS — forge-p04-researcher-research-to-worker-handoff*.test.ts (42/42); property 8/8; contractFuzz rejected=72/72; runRecordFuzz mutationsAccepted=0
evidence: runResearcherResearchToWorkerHandoffPropertyFuzzSlice + runResearcherResearchToWorkerHandoffPropertyValidation + runResearcherResearchToWorkerHandoffFuzzValidation + runResearcherResearchToWorkerHandoffRunRecordFuzzValidation
next: P04-B09-A08

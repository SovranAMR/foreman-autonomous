# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B02
active_atom: P04-B02-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 317/1000
phase_progress: 17/100
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

P04-B02-A08 — Repo içi kanıt toplama: Forge entegrasyonu ile regression testini tamamla.

objective: P04-B02-A07 PASS; add Forge integration regression test for in-repo evidence collection.
target: probe regression detection, forge regression gate, orchestrator verification hook.
hypothesis: Forge regression gate rejects tampered prior records and alignment regressions.
acceptance: regression probes PASS; forge gate rejects tampered prior and probe regressions.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B02-A08 regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B02-A07
last_commit: 8cd237b
tests: PASS — forge-p04-researcher*.test.ts (90/90); property/fuzz slice 8 properties; contractFuzz rejected=24/24; runRecordFuzz mutationsAccepted=0
evidence: runResearcherInRepoEvidencePropertyFuzzSlice; runResearcherInRepoEvidencePropertyChecks; runResearcherInRepoEvidenceFuzzValidation; runResearcherInRepoEvidenceRunRecordFuzzValidation; property/fuzz slice PASS
next: P04-B02-A08

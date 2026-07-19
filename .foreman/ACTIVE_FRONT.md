# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B02
active_atom: P04-B02-A07
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 316/1000
phase_progress: 16/100
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

P04-B02-A07 — Repo içi kanıt toplama: unit, property ve fuzz doğrulamasını ekle.

objective: P04-B02-A06 PASS; add unit, property and fuzz validation for in-repo evidence collection.
target: structural property checks, fixture fuzz validation, run record fuzz validation.
hypothesis: Property/fuzz slice gate rejects all deterministic mutations with zero accepted fuzz cases.
acceptance: property/fuzz probes PASS; contract and run record fuzz reject all mutations.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B02-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B02-A06
last_commit: 3795cc3
tests: PASS — forge-p04-researcher*.test.ts (84/84); evidence slice 6 probes; expectedFail=0; harnessVersion=1.0.0-a06; matrixValidation.unexpectedMismatches=0
evidence: runResearcherInRepoEvidenceEvidenceSlice; validateResearcherInRepoEvidenceEvidenceRunRecord; runResearcherInRepoEvidenceProbesWithRecord; evidence/telemetry/provenance slice PASS
next: P04-B02-A07

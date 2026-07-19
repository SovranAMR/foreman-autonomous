# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B02
active_atom: P04-B02-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 312/1000
phase_progress: 12/100
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

P04-B02-A03 — Repo içi kanıt toplama: en küçük üretim dikey dilimini uygula.

objective: P04-B02-A02 PASS; implement minimal production vertical slice for in-repo evidence collection.
target: recoverInRepoEvidence production stub, probe wiring for riev.structured_repo_evidence_recovery.
hypothesis: Typed contract gap probe provides stable entry for minimal recoverInRepoEvidence slice.
acceptance: recoverInRepoEvidence exported; gap probe transitions or remains documented FAIL with slice wiring.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B02-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B02-A02
last_commit: pending
tests: PASS — forge-p04-researcher*.test.ts (72/72); contract 23 probes; expectedFail=1; harnessVersion=1.0.0-a02
evidence: getResearcherInRepoEvidenceCategoryContract; summarizeResearcherInRepoEvidenceContractCoverage; validateResearcherInRepoEvidenceContractCoverage; validateResearcherInRepoEvidenceAgainstContract; FORGE_RESEARCHER_IN_REPO_EVIDENCE_CONTRACT_V1; gap=riev.structured_repo_evidence_recovery
next: P04-B02-A03

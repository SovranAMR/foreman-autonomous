# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B02
active_atom: P04-B02-A02
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 311/1000
phase_progress: 11/100
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

P04-B02-A02 — Repo içi kanıt toplama: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P04-B02-A01 PASS; define typed contract with measurable acceptance criteria for in-repo evidence collection.
target: Typed contract v1, probe criteria wiring, fixture↔contract alignment gate.
hypothesis: Documented FAIL gap (recoverInRepoEvidence) provides stable contract entry for production slice.
acceptance: contract loads; criteria wired; fixture aligned; A01 baseline remains valid.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B02-A02 contract slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B02-A01
last_commit: 28f6bb1
tests: PASS — forge-p04-researcher*.test.ts (64/64); baseline 23 probes; knownGaps=1; handoff P04-B01→B02 validated
evidence: loadResearcherInRepoEvidenceBaseline; runResearcherInRepoEvidenceProbes; FORGE_RESEARCHER_IN_REPO_EVIDENCE_CONTRACT_V1; harnessVersion=1.0.0-a01; gap=riev.structured_repo_evidence_recovery
next: P04-B02-A02

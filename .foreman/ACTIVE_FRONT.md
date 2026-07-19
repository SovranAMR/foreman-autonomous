# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B08
active_atom: P01-B08-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 70/1000
phase_progress: 69/100
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

P01-B08-A02 — Evidence ve artifact şeması: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: B08-A01 baseline PASS; typed contract ile evidence/artifact acceptance kriterini tanımla.
target: FORGE_EVIDENCE_ARTIFACT_CONTRACT_V1; measurable category contracts.
hypothesis: A01 baseline fixture ve 7 documented FAIL gap A02 contract girişi için yeterli.
acceptance: typed contract tanımlanır; baseline fixture contract ile hizalanır.
commands: npx tsx --test src/forge-evidence-artifact*.test.ts (A02 suite)
blast_radius: forge-evidence-artifact*.ts
rollback: A02 contract slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B08-A01
last_commit: pending
tests: PASS — forge-evidence-artifact-baseline.test.ts (3/3); 25 probes / 7 FAIL gaps aligned
evidence: loadEvidenceArtifactBaseline; runEvidenceArtifactProbes; validateEvidenceArtifactBaseline; B07 handoff entryCriteria
next: P01-B08-A02

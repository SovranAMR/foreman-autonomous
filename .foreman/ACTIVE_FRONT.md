# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B08
active_atom: P01-B08-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 71/1000
phase_progress: 70/100
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

P01-B08-A03 — Evidence ve artifact şeması: en küçük üretim dikey dilimini uygula.

objective: A02 typed contract PASS; en küçük üretim dikey dilimini uygula.
target: runEvidenceArtifactProductionSlice; contract-wired probe matrix with zero unexpected mismatches.
hypothesis: A02 contract + A01 baseline fixture yeterli giriş kanıtı sağlar.
acceptance: production slice çalışır; contract-aligned matrix; zero pass mismatches.
commands: npx tsx --test src/forge-evidence-artifact*.test.ts (A03 suite)
blast_radius: forge-evidence-artifact*.ts
rollback: A03 production slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B08-A02
last_commit: pending
tests: PASS — forge-evidence-artifact*.test.ts (9/9); FORGE_EVIDENCE_ARTIFACT_CONTRACT_V1 25 probes / 7 FAIL gaps
evidence: getActiveEvidenceArtifactContract; validateEvidenceArtifactBaselineAgainstContract; contract-wired probe criteria
next: P01-B08-A03

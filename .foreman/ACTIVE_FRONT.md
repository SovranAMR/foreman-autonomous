# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B08
active_atom: P01-B08-A08
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 76/1000
phase_progress: 75/100
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

P01-B08-A08 — Evidence ve artifact şeması: Forge entegrasyonu ile regression testini tamamla.

objective: A07 property/fuzz PASS; Forge entegrasyonu ile regression testini tamamla.
target: runForgeEvidenceArtifactRegressionGate; probe regression integration with property/fuzz gates.
hypothesis: A07 property/fuzz + A06 run record builder yeterli regression giriş kanıtı sağlar.
acceptance: regression gate passes; probe alignment stable; property/fuzz wired in gate; zero pass mismatches.
commands: npx tsx --test src/forge-evidence-artifact*.test.ts (A08 suite)
blast_radius: forge-evidence-artifact*.ts
rollback: A08 regression slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: regression uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B08-A07
last_commit: pending
tests: PASS — forge-evidence-artifact*.test.ts (23/23); property/fuzz gates 8 properties + 72 fixture mutations + 5 run-record mutations rejected
evidence: runEvidenceArtifactPropertyChecks; runEvidenceArtifactFuzzValidation; runEvidenceArtifactRunRecordFuzzValidation; validateEvidenceArtifactFailureRecoveryRunRecord
next: P01-B08-A08

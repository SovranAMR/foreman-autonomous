# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B08
active_atom: P01-B08-A07
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 75/1000
phase_progress: 74/100
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

P01-B08-A07 — Evidence ve artifact şeması: unit, property ve fuzz doğrulamasını ekle.

objective: A06 evidence/telemetry/provenance slice PASS; unit, property ve fuzz doğrulamasını ekle.
target: validateEvidenceArtifactFailureRecoveryRunRecord; property/fuzz gates for evidence artifact run records.
hypothesis: A06 run record builder + validation yeterli fuzz/property giriş kanıtı sağlar.
acceptance: failure/recovery run record property checks pass; fuzz rejects corrupted records; zero pass mismatches.
commands: npx tsx --test src/forge-evidence-artifact*.test.ts (A07 suite)
blast_radius: forge-evidence-artifact*.ts
rollback: A07 property/fuzz slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: property/fuzz uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B08-A06
last_commit: pending
tests: PASS — forge-evidence-artifact*.test.ts (18/18); runEvidenceArtifactFailureRecoverySliceWithRecord 6 probes aligned
evidence: validateEvidenceArtifactFailureRecoveryRunRecord; buildEvidenceArtifactRunRecord contract-wired evidence/telemetry/provenance
next: P01-B08-A07

# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B08
active_atom: P01-B08-A06
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 74/1000
phase_progress: 73/100
block_progress: 5/10
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

P01-B08-A06 — Evidence ve artifact şeması: evidence, telemetry ve provenance kaydını ekle.

objective: A05 failure/recovery slice PASS; evidence, telemetry ve provenance kaydını ekle.
target: runEvidenceArtifactFailureRecoverySliceWithRecord; auditable evidence/telemetry/provenance for failure/recovery gate.
hypothesis: A05 failure/recovery gate + run record builder yeterli giriş kanıtı sağlar.
acceptance: failure/recovery run record çalışır; contract-aligned evidence bundle; zero pass mismatches.
commands: npx tsx --test src/forge-evidence-artifact*.test.ts (A06 suite)
blast_radius: forge-evidence-artifact*.ts
rollback: A06 evidence/telemetry/provenance slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: run record uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B08-A05
last_commit: pending
tests: PASS — forge-evidence-artifact*.test.ts (16/16); runEvidenceArtifactFailureRecoverySlice 2 pass / 4 gap aligned
evidence: validateEvidenceArtifactFailureRecoveryProbeMatrix; runEvidenceArtifactFailureRecoverySlice contract-wired failure/recovery/nogo gate
next: P01-B08-A06

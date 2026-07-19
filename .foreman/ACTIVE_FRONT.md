# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B08
active_atom: P01-B08-A05
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 73/1000
phase_progress: 72/100
block_progress: 4/10
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

P01-B08-A05 — Evidence ve artifact şeması: failure, recovery ve NO-GO yollarını uygula.

objective: A04 boundary slice PASS; failure, recovery ve NO-GO yollarını uygula.
target: runEvidenceArtifactFailureRecoverySlice; failure/recovery/nogo category probes with zero unexpected mismatches.
hypothesis: A04 boundary gate + contract failure/recovery/nogo probes yeterli giriş kanıtı sağlar.
acceptance: failure/recovery slice çalışır; contract-aligned failure matrix; zero pass mismatches.
commands: npx tsx --test src/forge-evidence-artifact*.test.ts (A05 suite)
blast_radius: forge-evidence-artifact*.ts
rollback: A05 failure/recovery slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: failure/recovery slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B08-A04
last_commit: pending
tests: PASS — forge-evidence-artifact*.test.ts (13/13); runEvidenceArtifactBoundarySlice 3 pass / 0 gap aligned
evidence: validateEvidenceArtifactBoundaryProbeMatrix; runEvidenceArtifactBoundarySlice contract-wired boundary gate
next: P01-B08-A05

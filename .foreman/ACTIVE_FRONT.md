# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B08
active_atom: P01-B08-A03
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 72/1000
phase_progress: 71/100
block_progress: 3/10
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

P01-B08-A04 — Evidence ve artifact şeması: boundary ve edge-case davranışlarını tamamla.

objective: A03 production slice PASS; boundary ve edge-case davranışlarını tamamla.
target: runEvidenceArtifactBoundarySlice; boundary category probes with zero unexpected mismatches.
hypothesis: A03 matrix gate + contract boundary probes yeterli giriş kanıtı sağlar.
acceptance: boundary slice çalışır; contract-aligned boundary matrix; zero pass mismatches.
commands: npx tsx --test src/forge-evidence-artifact*.test.ts (A04 suite)
blast_radius: forge-evidence-artifact*.ts
rollback: A04 boundary slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: boundary slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B08-A03
last_commit: pending
tests: PASS — forge-evidence-artifact*.test.ts (10/10); runEvidenceArtifactProductionSlice 18 pass / 7 gap aligned
evidence: validateEvidenceArtifactProbeMatrix; runEvidenceArtifactProductionSlice contract-wired matrix gate
next: P01-B08-A04

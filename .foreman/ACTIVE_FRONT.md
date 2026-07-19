# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B08
active_atom: P01-B08-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 77/1000
phase_progress: 76/100
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

P01-B08-A09 — Evidence ve artifact şeması: adversarial, performance, cost ve safety kontrolünü geçir.

objective: A08 regression gate PASS; adversarial/perf/cost/safety guard kontrollerini tamamla.
target: validateForgeEvidenceArtifactGuard; adversarial guard scenarios; performance/cost/safety domains.
hypothesis: A08 regression gate guard foundation + A09 sealed controls yeterli adversarial kanıt sağlar.
acceptance: guard passes; adversarial scenarios reject tampered records; perf/cost/safety domains validated.
commands: npx tsx --test src/forge-evidence-artifact*.test.ts (A09 suite)
blast_radius: forge-evidence-artifact*.ts
rollback: A09 guard slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: guard uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B08-A08
last_commit: pending
tests: PASS — forge-evidence-artifact*.test.ts (34/34); regression gate 25/25 aligned; propertyFuzz 8/8 properties + 24/24 contract fuzz + 3/3 run-record fuzz; guard adversarial 3/3
evidence: runForgeEvidenceArtifactRegressionGate; runEvidenceArtifactProbesWithRecord; detectEvidenceArtifactProbeRegression; validateForgeEvidenceArtifactGuard; orchestrator verifyForgeEvidenceArtifactRegression
next: P01-B08-A09

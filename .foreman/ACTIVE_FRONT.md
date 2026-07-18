# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A05
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 4/1000
phase_progress: 4/100
block_progress: 4/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-18

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

P01-B01-A05 — Failure, recovery ve NO-GO yollarını uygula.

objective: Contract kabul kriterlerindeki failure, recovery ve NO-GO yollarını uygula.
target: src/forge-baseline-contract.ts, ilgili seam (A05 kapsamında belirlenecek).
hypothesis: Rollback no-git edge-case kapatıldı; sıradaki dilim failure/recovery NO-GO yolları.
acceptance: Failure/recovery davranışı + hedefli test PASS + regression PASS.
commands: npx tsx --test src/forge-pipeline-baseline.test.ts; ilgili failure-recovery testi.
blast_radius: A05 kapsamında belirlenecek tek seam.
rollback: A05 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: failure path seçilemezse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A04
last_commit: (this commit)
tests: PASS — forge-baseline-contract (4/4), forge-pipeline-baseline (2/2), forge-engines rollback edge-case
evidence: isGitRepository(); createPoint null without git; contract probe rollback.point_without_git → PASS (20/20 matrix)
next: P01-B01-A05

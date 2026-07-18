# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B02
active_atom: P01-B02-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 10/1000
phase_progress: 10/100
block_progress: 0/10
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

P01-B02-A01 — Mevcut pipeline davranış haritası: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: Orchestrator pipeline fazlarının gözlemlenebilir davranış haritasını çıkar; B01 handoff baseline'ına dayalı failing fixture oluştur.
target: Pipeline behavior map fixture + harness probe seam.
hypothesis: P01-B01 block gate sealed; B02-A01 live pipeline phase→behavior eşlemesini ölçer.
acceptance: Behavior map fixture yüklenir, en az bir bilinen gap FAIL olarak yakalanır, hedefli test PASS.
commands: B02-A01 kapsamında belirlenecek.
blast_radius: B02-A01 kapsamında belirlenecek tek seam.
rollback: B02-A01 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: pipeline map çıkarılamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A10
last_commit: pending
tests: PASS — forge-baseline-block-gate (6/6), forge-baseline-contract.guard (8/8), forge-pipeline-regression.integration (4/4), forge-pipeline-baseline (3/3), forge-baseline-contract (8/8), forge-baseline-contract.property-fuzz (4/4)
evidence: runForgeBaselineBlockGate 10/10 atom seals, FORGE_P01_B01_TO_B02_HANDOFF_V1→P01-B02-A01, Orchestrator.verifyForgeBaselineBlockGate baseline_block_gate event
next: P01-B02-A01

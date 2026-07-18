# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 3/1000
phase_progress: 3/100
block_progress: 3/10
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

P01-B01-A04 — Boundary ve edge-case davranışlarını tamamla.

objective: Contract kabul kriterlerindeki boundary ve edge-case davranışlarını tamamla.
target: src/forge-baseline-contract.ts, ilgili seam (A04 kapsamında belirlenecek).
hypothesis: Reviewer empty-response gap kapatıldı; kalan rollback gap veya diğer edge-case'ler sıradaki dilim.
acceptance: Boundary/edge-case davranışı + hedefli test PASS + regression PASS.
commands: npx tsx --test src/forge-pipeline-baseline.test.ts; ilgili edge-case testi.
blast_radius: A04 kapsamında belirlenecek tek seam.
rollback: A04 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: edge-case seçilemezse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A03
last_commit: (pending)
tests: PASS — reviewer-gate (10/10), forge-baseline-contract (4/4), forge-pipeline-baseline (2/2)
evidence: classifyReviewerLlmResponse; orchestrator no auto-PASS on empty reviewer; contract probe reviewer.empty_llm_response_passes → PASS
next: P01-B01-A04

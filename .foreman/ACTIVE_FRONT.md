# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 2/1000
phase_progress: 2/100
block_progress: 2/10
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

P01-B01-A03 — En küçük üretim dikey dilimini uygula.

objective: Typed contract kabul kriterlerinden en küçük üretim dikey dilimini çıkar ve uygula.
target: src/forge-baseline-contract.ts, orchestrator seam (henüz değiştirme — A03 kapsamında belirlenecek).
hypothesis: Contract tanımlandı; şimdi documented FAIL gap'lerden birini düzeltmek için minimal dikey dilim seçilebilir.
acceptance: Tek davranış değişikliği + hedefli test PASS + regression PASS.
commands: npx tsx --test src/forge-pipeline-baseline.test.ts; ilgili dikey dilim testi.
blast_radius: A03 kapsamında belirlenecek tek seam.
rollback: A03 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: dikey dilim seçilemezse BLOCKED raporla, fixture/contract genişletme.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A02
last_commit: (pending)
tests: PASS — forge-baseline-contract (4/4), forge-pipeline-baseline (2/2)
evidence: FORGE_BASELINE_CONTRACT_V1 typed contract; 6 path invariants; 20 probe↔criterion mappings; fixture↔contract validation enforced at load
next: P01-B01-A03

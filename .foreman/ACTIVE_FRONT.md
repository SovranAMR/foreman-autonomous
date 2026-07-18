# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A01
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 0/1000
phase_progress: 0/100
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

P01-B01-A01 — Mission ve acceptance contract için mevcut davranış ve failing baseline.

objective: Forge Pipeline'ın bugün gerçekten neyi garanti ettiğini executable baseline ile ölç.
target: src/orchestrator.ts, mevcut orchestrator/pipeline testleri ve yeni baseline fixture.
hypothesis: Belgelenen Forge davranışları ile testle enforce edilen davranışlar arasında boşluklar var.
acceptance: state, tool, verification, reviewer, rollback ve resume yollarının mevcut PASS/FAIL matrisi versioned test/evidence olarak üretildi.
commands: önce ilgili orchestrator ve pipeline testlerini çalıştır; sonra atomun eklediği hedefli testi çalıştır.
blast_radius: yalnız test/evidence seam; üretim davranışını bu atomda değiştirme.
rollback: atomun eklediği fixture/test/evidence dosyalarını geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: baseline test seam'i mümkün değilse önce testability seam ekle ve aynı atom kimliğinde kal.

## Tur sonunda zorunlu kayıt

last_atom: NONE
last_commit: NONE
tests: NOT-RUN
evidence: Program initialized
next: P01-B01-A01

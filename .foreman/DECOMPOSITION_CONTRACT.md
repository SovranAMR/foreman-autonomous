# FOREMAN 10 / 100 / 1000 DECOMPOSITION CONTRACT

## Sabit hiyerarşi

FOREMAN-FORGE-1000
→ 10 phase
→ phase başına 10 block
→ block başına 10 atom
→ toplam 100 block / 1.000 atom

Kimlikler P01-B01-A01 biçimindedir. Tamamlanan kimlik yeniden kullanılmaz veya
numaralanmaz. Aynı anda yalnız bir atom ACTIVE olabilir.

## Atomların ortak 10 adımlı yaşam döngüsü

Her block kendi konusu için şu 10 ayrı atomu taşır:

1. Mevcut davranış ve failing baseline.
2. Typed contract ve ölçülebilir acceptance.
3. En küçük üretim dikey dilimi.
4. Boundary ve edge-case davranışı.
5. Failure, recovery ve NO-GO yolu.
6. Evidence, telemetry ve provenance.
7. Unit/property/fuzz doğrulaması.
8. Forge entegrasyonu ve regression.
9. Adversarial, performance, cost ve safety kontrolü.
10. Block gate, kanıt paketi ve handoff.

Bu yaşam döngüsü otomasyona kör şablon uygulama izni vermez. Her atom başlamadan önce
target symbol/dosya, hipotez, acceptance command, blast radius, rollback ve evidence path
gerçek kod okunarak ACTIVE_FRONT içine yazılır.

## Atom PASS koşulu

- Tek davranış veya tek doğrulama kabiliyeti değişmiş.
- Hedefli test PASS.
- Etkilenen regresyonlar PASS.
- Diff yalnız atom kapsamını içeriyor.
- Kanıt aktif phase dosyası ve ACTIVE_FRONT içinde.
- Sıradaki tek atom seçilmiş.

Docs-only, status-only, format-only veya test çalıştırılmamış değişiklik PASS değildir.

## Block gate

- 10 atom terminal durumda.
- Kritik NO-GO/BLOCKED kapatılmış veya açık insan kararı var.
- Block hedefli suite PASS.
- Önce/sonra metriği ve regression sonucu kayıtlı.
- Reviewer ve ground-truth kapısı PASS.

## Phase gate

- 10 block gate PASS.
- Phase acceptance suite PASS.
- Tam npm test PASS.
- Typecheck PASS.
- İlgili chaos veya sealed eval PASS.
- STATE ve teknik belgeler gerçekle uyumlu.
- Sonraki phase için giriş baseline'ı hazır.

## Program drift koruması

- MASTER_PLAN sırası kanıtsız atlanmaz.
- Forge Pipeline'a katkısı olmayan özellik active programa sokulmaz.
- Test veya benchmark hedefi sonuca göre değiştirilmez.
- Mock/canary sonucu canlı başarı diye sunulmaz.
- Eski PASS, ilgili davranış değiştiğinde yeniden doğrulanır.

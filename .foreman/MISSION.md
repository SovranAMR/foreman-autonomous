# FOREMAN — ANA MİSYON

## Yapılış amacı

Foreman, AI agent'ları disiplinize eden bir orkestratördür. Bir görevi yalnız sonuç
üreten tek çağrı olarak görmez; Vizyoner, Stratejist, Araştırmacı ve İşçi katmanlarından
geçirir. Her katman gerçek bağlama dayanır, atomik ilerler ve ürettiği sonucu doğrular.

Ana ürün Forge Pipeline'dır. Foreman'ın bütün alt sistemleri bu çekirdeğin daha doğru,
daha güvenilir, daha uzun ufuklu ve daha verimli çalışmasına hizmet eder.

## Kuzey yıldızı

Foreman'ı dünyanın en iyi doğrulanabilir agent sistemi haline getir:

- amacı ve kısıtları doğru anlayan;
- gerçek repoyu ve ortamı okuyarak planlayan;
- her işi geri alınabilir atomlara bölen;
- araştırma ve kanıt olmadan varsayım yapmayan;
- araçlarla gerçek iş yapan;
- test, review ve ground truth olmadan PASS demeyen;
- hata, kota, kesinti ve crash sonrasında güvenle devam eden;
- uzun görevlerde yönünü ve bağlamını kaybetmeyen;
- kullanıcı kontrolünü, maliyeti ve güvenliği koruyan;
- başarısını bağımsız benchmark ile ispatlayan.

## Tek operasyonel gerçek

Okuma sırası:

1. .foreman/MISSION.md
2. .foreman/MASTER_PLAN.md
3. .foreman/DECOMPOSITION_CONTRACT.md
4. .foreman/ACTIVE_FRONT.md
5. .foreman/phases içindeki aktif phase dosyası
6. STATE.md, VISION.md, ARCHITECTURE.md ve gerçek kaynak/testler

Güncel tek iş .foreman/ACTIVE_FRONT.md içindeki active_atom'dur.

## Program geometrisi

FOREMAN-FORGE-1000 tam olarak:

- 10 ana phase;
- phase başına 10 block;
- block başına 10 atom;
- toplam 100 block ve 1.000 atom.

Bu program Kimi sürüm yükseltme planı değildir. Kimi K3 geçişi yalnız tek seferlik
bootstrap görevidir. 1.000 atomun amacı Foreman'ın kuruluş amacı doğrultusunda Forge
Pipeline'ın tamamını sistematik olarak geliştirmektir.

## Değişmez çalışma döngüsü

gerçek durum
→ tek atom
→ en küçük üretim değişikliği
→ hedefli doğrulama
→ bağımsız review/ground truth
→ kanıt
→ checkpoint ve commit
→ sıradaki atom

## İddia standardı

WORLD-CLASS veya WORLD-BEST ifadesi hedef olarak kullanılabilir; sonuç iddiası olarak
yalnız güncel, sealed, yeniden üretilebilir ve maliyeti açıklanmış dış değerlendirmeler
destekliyorsa kullanılabilir. Self-report, demo, mock, yalnız test sayısı veya yalnız
model gücü dünya liderliği kanıtı değildir.

## Kırmızı çizgiler

- Docs-only ilerleme döngüsü yok.
- Testi gevşeterek PASS üretmek yok.
- Benchmark'a özel hard-code veya leakage yok.
- Kullanıcı değişikliklerini silmek, force-push veya gizli side effect yok.
- Secret, token veya kişisel veriyi repoya/loga yazmak yok.
- Aynı başarısız yaklaşımı üçten fazla tekrar etmek yok.
- Forge Pipeline'dan kopuk özellik şişirmesi yok.

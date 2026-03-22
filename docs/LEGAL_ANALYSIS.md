# HUKUKİ VE TEKNİK ANALİZ: TEK AKIŞ (UNIFIED FEED) VE MESAJLAŞMA

## 1. Neden Tüm Sosyal Medyaları Tek Akışta Toplayamayız? (Yasal Olarak)
Bunun önündeki tek engel teknik değil, **%100 yasal ve ticari** engellerdir.

### İş Modeli Çatışması (Reklam Geliri)
Instagram, TikTok, X ve Facebook'un tek para kazanma yöntemi, kullanıcıların akışında (feed) kaydırırken **kendi reklamlarını** göstermesidir. 
Siz kullanıcıların akışını (feed) kendi uygulamanıza çekerseniz, bu platformlar o kullanıcıya kendi reklamlarını gösteremez ve para kaybederler. Bu nedenle **hiçbir büyük sosyal medya platformu, genel kullanıcı akışını dışarıya veren resmi bir API sunmaz.**

### Platform Bazlı API Kısıtlamaları:
*   **Meta (Instagram / Facebook):** API üzerinden bir kullanıcının anasayfasında gördüğü "Keşfet" veya "Takip Ettiklerinin Gönderileri" akışını çekemezsiniz. Resmi API sadece kullanıcının **kendi profil verilerini** ve işletme hesaplarına gelen yorumları okumasına izin verir.
*   **TikTok:** API, kullanıcının videolarını paylaşmasına veya istatistiklerini görmesine izin verir. Ancak TikTok'un kalbi olan "Sizin İçin (For You)" akışını dışarıya aktaran hiçbir yasal uç nokta (endpoint) yoktur.
*   **X (Twitter):** API V2'de "Home Timeline" okuma özelliği vardır, ancak bu veri inanılmaz derecede pahalıdır (Kurumsal paketler aylık on binlerce dolardan başlar) ve X yönetimi, kendi platformuna rakip olan 3. parti istemcileri (örn: Tweetbot) geçmişte tamamen yasaklamıştır.

## 2. Neden Tüm Mesajlaşmaları Tek Yerde Toplayamayız? (Yasal Olarak)
*   **WhatsApp ve Instagram DM:** Sadece Business/İşletme hesapları için resmi API sunarlar. Sıradan bir kullanıcının (arkadaşlarıyla mesajlaştığı) kişisel DM kutusuna resmi API ile erişmek Meta politikalarına göre yasaktır.
*   **Beeper / Texts.com Örneği:** Piyasada tüm mesajları tek yerde toplayan (Beeper gibi) uygulamalar vardır. Ancak bunlar resmi API kullanmazlar. Sistem, arka planda gizlice bir web tarayıcısı çalıştırarak "Tersine Mühendislik" (Reverse Engineering) yapar. Bu yöntemler **Kullanıcı Sözleşmesini (ToS) ihlal eder** ve her an platformlar tarafından engellenebilirler (Nitekim Apple, Beeper Mini'yi anında kapattı).

## SONUÇ
Tamamen yasal kalmak istiyorsak; "Sıradan bir kullanıcının tüm akışını ve mesajlarını tek yerde toplayan bir uygulama" **yapılamaz**. Platformlar sizi dava edebilir veya API erişiminizi kalıcı olarak iptal eder.
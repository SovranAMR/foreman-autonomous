# OmniSocial - Yasal ve Tam Uyumlu Mimari Tasarım (%100 Official API)

## 1. Hukuki Gerçekler ve Yeni Vizyon (İçerik Üreticisi / Marka Odaklı)
Eğer **"Yasal ve hukuki hiçbir engel olmamalı"** diyorsak, platformların (Meta, X, TikTok, LinkedIn) Hizmet Şartları'nı (ToS) ihlal eden "veri kazıma (scraping)" veya "tersine mühendislik" yöntemlerini kullanamayız. 

**Bilinmesi Gereken Hukuki API Sınırları:**
- **Kişisel Akış (Feed) Okuma:** Facebook, Instagram, TikTok ve LinkedIn, kullanıcıların anasayfalarını (arkadaşlarının gönderilerini) 3. parti uygulamalara **kapalı tutar**. Bu veriyi yasal yollarla çekip tek bir "Keşfet" sunmak imkansızdır.
- **Kişisel DM'ler:** Sadece işletme hesaplarının mesajları (Instagram Business, Facebook Page) yasal API ile okunup cevaplanabilir. Kişisel mesajlar dışarıya verilmez.

**✅ Yasal ve Kârlı Vizyon (Buffer / Hootsuite Modeli):**
Uygulamamız sıradan kullanıcıların girdiği bir "Feed okuma" uygulamasından ziyade; İçerik Üreticilerinin (Creators), Markaların ve Ajansların **tüm sosyal medyalarını tek merkezden yönettiği, gönderi planladığı ve kendi kitlelerinin etkileşimlerini (yorumlar, istatistikler, kendi gönderileri) tek ekranda gördüğü bir "Super App"** olmalıdır.

## 2. Mimari ve Teknoloji Yığını (iOS, Android, Web)
- **Frontend:** Flutter veya React Native. (Tek kod tabanı ile 3 platforma hızlıca çıkılır).
- **Backend:** Node.js (NestJS) veya Go. Resmi API (OAuth 2.0) entegrasyonları, rate-limit yönetimi ve token yenileme (refresh token) işlemleri için ideal.
- **Veritabanı:** PostgreSQL (Kullanıcı hesapları, token'lar, planlanmış gönderiler). Redis (Kuyruk yönetimi - BullMQ).
- **Medya İşleme:** AWS S3 (Depolama) ve FFmpeg (Videoları TikTok için dikey, YouTube için yatay vs. otomatik kırpma).

## 3. Özellik Seti (%100 Yasal ve Resmi API Uyumlu)
1. **Çapraz Paylaşım (Cross-Posting) & Zamanlama:** Kullanıcı uygulamaya bir video/fotoğraf yükler. Sistem bunu aynı anda:
   - Instagram (Graph API)
   - Facebook (Page API)
   - TikTok (Content Posting API)
   - LinkedIn (Share API)
   - Pinterest (Pin API)
   - X (Twitter API V2)
   üzerinde paylaşır veya ileri bir tarihe zamanlar (Cron jobs).
2. **Birleşik Yorum Yönetimi (Unified Inbox):** Kullanıcının *kendi* gönderilerine gelen yorumlar tek bir ekranda toplanır, oradan yanıtlanır.
3. **Kendi Gönderilerinden Oluşan Akış (Creator Feed):** Kullanıcının tüm platformlardaki *kendi paylaşımları* ve istatistikleri X algoritması mantığıyla sıralanarak "En iyi performans gösterenler" başlığında sunulur.

## 4. X Açık Kaynak Algoritmasının Rolü
X'in açık kaynak yaptığı algoritmayı (Heavy Ranker), kendi iç sistemimizde kullanıcının istatistiklerini sıralamak için kullanacağız. Uygulama içinde kullanıcıların kendi aralarında takipleşebildiği dahili bir ağ kurarsak, o ağın "Keşfet" algoritmasını X'in kodlarıyla, yasal olarak, %100 kendi sunucularımızda çalıştırabiliriz.

## 5. Yol Haritası (Faz 1 - MVP)
- **Adım 1:** Meta (Facebook/Instagram), Google (YouTube), TikTok ve LinkedIn Developer portallarında resmi uygulama oluşturulması ve OAuth2 girişlerinin (Login with...) bağlanması.
- **Adım 2:** Veritabanında güvenli token yönetimi (AES-256 şifreleme ile erişim anahtarlarının saklanması).
- **Adım 3:** Tek tıkla tüm platformlara gönderi atabilen "Universal Composer" (Evrensel Paylaşım Editörü) arayüzünün kodlanması.
- **Adım 4:** Platformların resmi onayı (App Review) için dokümanların hazırlanması.

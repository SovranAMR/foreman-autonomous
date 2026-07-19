# TEKNİK DEĞERLENDİRME NOTU
## Sapphire B2B Siber Saldırı — SAP-CYBER-2026-0428-001

Bu belge, karşı tarafın öne sürebileceği olası itirazları ve bunlara
yönelik teknik değerlendirmeleri içermektedir.

---

## 1. "Deliller manipüle edilmiş olabilir"

### Değerlendirme:

Kritik deliller şikayet eden tarafın kontrol edemediği üçüncü parti
kaynaklarda tutulmaktadır:

| Delil | Kaynak | Kontrol |
|-------|--------|---------|
| İlişkilendirilen IP | webhook.site (Danimarka) | Üçüncü parti |
| IP geolocation | IPinfo.io (ABD) | Üçüncü parti |
| Altyapı bilgisi | 84.44.79.182 (ilişkilendirilen taraf) | Karşı taraf |
| Domain WHOIS | Nic.tr (Türk devlet kurumu) | Resmi kayıt |
| Port taraması | Shodan.io (ABD) | Üçüncü parti |
| Web arşivi | Archive.org (ABD) | Üçüncü parti |

Delillerin bağımsız doğrulaması için `BAGIMSIZ_DOGRULAMA.sh` scripti
sunulmuştur. Bu script üçüncü parti kaynaklara sorgular yaparak
bulguların tutarlılığını test etmektedir.

---

## 2. "Webhook.site token'ını şikayet eden oluşturmuş olabilir"

### Değerlendirme:

- Token 13:20:13 UTC'de, 84.44.79.182 IP'sinden, curl/8.12.1 aracıyla
  oluşturulmuştur.
- Şikayet eden tarafın IP'si (88.247.179.167) token'a ilk kez 16:49:53
  UTC'de — yani token oluşturulduktan **3 saat 29 dakika sonra** — erişmiştir.
- Token'ın content-type ayarı `image/png` olarak yapılmıştır; bu SSRF
  payload'ı olarak kullanıma yönelik bir ayardır.
- Token'a gelen 16 adet Railway IP callback'i (162.220.234.129), SSRF
  saldırısının gerçekleştiğini bağımsız olarak doğrulamaktadır.

Resmi teyit için webhook.site'dan kayıtların uluslararası adli yardım
talebi ile istenmesi önerilmektedir.

---

## 3. "IP adresi ilişkilendirilen firmaya ait olmayabilir"

### Değerlendirme:

IP'nin A.I.T. altyapısıyla ilişkisi şu bulgulara dayanmaktadır:

1. 84.44.79.182:5000 üzerinde `og:url = https://aitools.ait.com.tr`
   meta tag'i bulunan web uygulaması servis edilmektedir.
2. `aitools.ait.com.tr`, `ait.com.tr` alan adının alt alan adıdır.
3. `ait.com.tr` WHOIS kaydında kayıt sahibi A.I.T. Bilgisayar Sistemleri
   olarak görünmektedir.
4. 84.44.79.182:5001 üzerinde A.I.T. logolu admin paneli bulunmaktadır.
5. Shodan.io bağımsız taramasında (27 Nisan 2026) port 5000 açık olarak
   raporlanmıştır.

Bu zincirdeki her halka bağımsız olarak doğrulanabilir. Ancak kesin
abone tespiti BTK aracılığıyla Vodafone'dan istenen hat/abone bilgileri
ile yapılmalıdır.

İlişkilendirilen taraf, bu sunucuyu kapatabilir veya içeriğini
değiştirebilir. Bu ihtimale karşı:
- HTML snapshot'ları delil paketinde mevcuttur
- Shodan.io kaydı bağımsız üçüncü parti taramadır
- Archive.org Wayback Machine'de arşivlenmiştir

---

## 4. "Saldırıyı firma çalışanı değil, üçüncü bir kişi yapmış olabilir"

### Değerlendirme:

Mevcut bulgularla doğrudan şahıs tespiti yapılamamaktadır. Ancak
aşağıdaki koşullar değerlendirilmelidir:

- Saldırı, ilişkilendirilen IP üzerindeki geliştirme ortamının aktif
  olduğu bir zaman diliminde gerçekleşmiştir (Vite dev server çalışıyordu).
- ip-api.com sorgusunda proxy=false ve hosting=false raporlanmıştır;
  bu, IP'nin doğrudan bir ISP bağlantısı olduğuna işaret etmektedir.
- Saldırı, A.I.T.'nin ilan ettiği mesai saatleri (08:30-18:30) içinde
  (16:20-16:46 TR saati) gerçekleşmiştir.
- Saldırı tamamen rakip ürün istihbaratı odaklıdır — dışarıdan bir
  saldırganın bu motivasyona sahip olması olağan değildir.

Kesin şahıs tespiti için:
- BTK'dan IP abone bilgisi istenmelidir
- İlişkilendirilen tarafın iç ağ logları ve erişim kayıtları incelenmelidir
- Olay saatindeki mesai ve fiziksel erişim kayıtları değerlendirilmelidir

### İlişkilendirilen Firma Çalışan Bilgileri (Açık Kaynak)

GitHub organizasyonu (aitsis) üzerinden tespit edilen geliştirici kadrosu:

| Kişi | Pozisyon | GitHub | Teknik Düzey |
|------|---------|--------|-------------|
| Hakan Özgür | CEO | hozgur (52 repo) | Yüksek (AI, CLI, multi-agent) |
| Umut S. Çeliker | R&D Team Leader | umutceliker (6 repo) | Orta |
| Oğuzhan Güldibi | Software Engineer | oguzhanguldibi (16 repo) | Orta-yüksek |
| Yasin Tunçer | Developer | yasintuncerr (10 repo) | Yüksek (ML/AI) |
| Talha Şöhret | Developer | Fenish (7 repo) | Orta |
| + 5 geliştirici daha | — | — | Düşük-orta |

Bu bilgiler şahıs isnadı amacıyla değil, soruşturma kapsamında
değerlendirilmek üzere sunulmuştur.

---

## 5. "Penetrasyon testi yapılıyordu"

### Değerlendirme:

Yasal penetrasyon testi için hedef sistem sahibinden yazılı izin ve
sözleşme gerekmektedir. Böyle bir izin veya sözleşme bulunmamaktadır.

Ayrıca tespit edilen faaliyetler standart güvenlik testi kapsamını
aşmaktadır:
- Credit sistemi manipüle edilmiştir (15.100 credit enjeksiyonu)
- Webhook.site ile veri dışarı aktarma mekanizması kurulmuştur
- Admin yetkili API anahtarı oluşturularak kalıcı erişim denenmiştir
- Platformun ticari özellikleri (AI motor kalitesi, pricing modeli,
  export formatları) sistematik olarak keşfedilmiştir

---

## 6. "Hesap bilgileri değiştirilmiş, delil bütünlüğü bozulmuş"

### Değerlendirme:

Olay sonrası güvenlik önlemi olarak saldırgan hesabının email ve isim
alanları değiştirilmiştir (BANNED-). Orijinal bilgiler şu kaynaklarda
korunmaktadır:

| Orijinal Bilgi | Korunduğu Kaynak | Kontrol |
|---------------|-----------------|---------|
| pentester1777378590@deltajohnsons.com | SSRF Data Exfil Proof SVG (CDN) | Saldırgan yükledi |
| PenTest User | SSRF Data Exfil Proof SVG (CDN) | Saldırgan yükledi |
| User ID | DB + Log + SVG + CDN URL | 4 bağımsız kaynak |
| API key adları (pentest-key, admin-key) | DB'de DISABLED- prefix ile | Orijinal ad korunmuş |

"SSRF Data Exfil Proof" SVG dosyası saldırgan tarafından oluşturulmuş
ve CDN'e yüklenmiştir. Bu dosya şikayet eden tarafından değiştirilemez.

---

## ZAMAN TUTARLILIĞI

5 bağımsız kaynaktaki zaman damgaları tutarlıdır:

| Saat (UTC) | Kaynak | Olay |
|-----------|--------|------|
| 12:17:10 | PostgreSQL | User kaydı oluşturuldu |
| 12:17:10 | PostgreSQL | İlk credit (+10 bonus) |
| 13:02:11 | Railway log | İlk pattern CDN'e kaydedildi |
| 13:20:13 | webhook.site | Token oluşturuldu (84.44.79.182) |
| 13:20:27 | webhook.site | İlk SSRF callback (CoreWeave) |
| 13:32:21 | webhook.site | İlk Railway callback (162.220.234.129) |
| 13:32:58 | webhook.site | 84.44.79.182'den Firefox erişimi |
| 15:09:23 | PostgreSQL | "SSRF Proof" pattern kaydı |
| 15:10:16 | PostgreSQL + CDN | "SSRF Data Exfil Proof" (SVG içeriğinde aynı IP'ler) |

Bu zaman damgaları farklı kaynaklarda (veritabanı, Railway log servisi,
webhook.site API, CDN) birbirinden bağımsız olarak kaydedilmiştir.

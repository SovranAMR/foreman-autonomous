# BİLİRKİŞİ / SAVCILIK ERİŞİM REHBERİ
## Sapphire B2B Siber Saldırı — SAP-CYBER-2026-0428-001

Bu belge, delillerin bağımsız olarak doğrulanabilmesi için gerekli erişim bilgilerini içerir.
**GİZLİ — Yalnızca yetkili bilirkişi ve savcılık personeline verilecektir.**

---

## 1. ÜÇÜNCÜ PARTİ KAYNAKLAR (Şifre Gerektirmez)

Bu kaynaklar herkese açıktır. Bilirkişi kendi bilgisayarından doğrulayabilir:

### 1.1 Webhook.site — Saldırgan IP Kaydı
```
Token: e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3

Saldırgan IP'yi görmek için:
curl -s "https://webhook.site/token/e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3"

Tüm 27 callback kaydını görmek için:
curl -s "https://webhook.site/token/e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3/requests?per_page=50"

⚠️ DİKKAT: Bu token 5 Mayıs 2026 14:19 UTC'de sona erecektir!
Sona ermeden önce veriler yasal yollarla teyit edilmelidir.
Yedek kopya: evidence/03-webhook-evidence/ klasöründe
```

### 1.2 IP Geolocation
```
curl -s "https://ipinfo.io/84.44.79.182/json"
Beklenen: city=Bursa, country=TR

curl -s "http://ip-api.com/json/84.44.79.182?fields=66846719"
Beklenen: country=Türkiye, proxy=false, hosting=false
```

### 1.3 Saldırgan Sunucu (A.I.T.)
```
curl -s "http://84.44.79.182:5000/"
Beklenen: og:url = https://aitools.ait.com.tr

curl -s "http://84.44.79.182:5001/panel"
Beklenen: AIT logolu "Archivist" login sayfası

⚠️ A.I.T. bu sunucuyu kapatabilir. Kapanmış olsa bile:
- Yerel snapshot: evidence/05-attacker-server-snapshots/
- Shodan kaydı: https://www.shodan.io/host/84.44.79.182
- Wayback Machine: archive.org'da arşivlenmiştir
```

### 1.4 WHOIS
```
whois ait.com.tr
Beklenen: A.I.T. BİLGİSAYAR SİSTEMLERİ...

whois 84.44.79.182
Beklenen: Vodafone Net, AS15924, Türkiye
```

### 1.5 CDN Kanıt Dosyaları (Saldırgan Tarafından Yüklenmiş)
```
SSRF Proof:
curl -s "https://cdn.sapphiresc.com/patterns/cmoilcgeq389cqo0f7wk908dj/pat-1777388963220-cxwhq41x1/original.svg+xml"

SSRF Data Exfil Proof:
curl -s "https://cdn.sapphiresc.com/patterns/cmoilcgeq389cqo0f7wk908dj/pat-1777389016430-8vhebbfdf/original.svg+xml"

Yedek kopya: evidence/06-cdn-artifacts/
```

### 1.6 Wayback Machine Arşivleri
```
Webhook.site token:
https://web.archive.org/web/20260428174327/https://webhook.site/token/e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3

Hakan Özgür profili:
https://web.archive.org/web/2026/https://www.ait.com.tr/kurumsal/hakan-ozgur
```

---

## 2. RAILWAY PLATFORM ERİŞİMİ

Railway, uygulamanın barındırıldığı cloud platformudur.
Sunucu logları burada görüntülenebilir.

```
Platform:     https://railway.app
Proje Adı:    sapphire-b2b
Proje ID:     df41edef-612e-4268-b573-8b3a38d88dbf
Servis ID:    ab173822-c997-4c06-bbf4-1099778a91e0
Ortam:        production
Domain:       sapphiresc.com

⚠️ Railway logları sınırlı süre tutuyor!
   Yerel yedek: evidence/01-server-logs/
```

### Railway'de İncelenecek Noktalar:
1. **Loglar** → "sapphire-b2b" servisine tıklayın → "Logs" sekmesi
2. **28 Nisan 2026** tarihli logları filtreleyin
3. "ECONNREFUSED", "169.254", "cmoilcgeq389cqo0f7wk908dj" arayın

---

## 3. VERİTABANI ERİŞİMİ (PostgreSQL)

Saldırganın hesap bilgileri, credit hareketleri ve pattern kayıtları
doğrudan veritabanından sorgulanabilir.

```
Veritabanı Türü:  PostgreSQL
Sunucu:           yamabiko.proxy.rlwy.net
Bağlantı:         Railway Dashboard → sapphire-b2b → Variables → DATABASE_URL

Bağlantı komutu:
psql "DATABASE_URL_BURAYA"
(Not: URL'deki ?connection_limit=... kısmını kaldırın)
```

### Sorgulanacak Kayıtlar:

```sql
-- Saldırgan kullanıcı kaydı
SELECT * FROM "User" WHERE id = 'cmoilcgeq389cqo0f7wk908dj';

-- Saldırganın oluşturduğu pattern'ler (SSRF Proof dahil)
SELECT name, status, "createdAt" FROM "Pattern"
WHERE "userId" = 'cmoilcgeq389cqo0f7wk908dj' ORDER BY "createdAt";

-- 257 credit hareketi (manipülasyon dahil)
SELECT type, description, amount, "createdAt" FROM "Credit"
WHERE "userId" = 'cmoilcgeq389cqo0f7wk908dj' ORDER BY "createdAt";

-- Oluşturulan API anahtarları
SELECT name, scopes, "isActive", "createdAt" FROM "ApiKey"
WHERE "userId" = 'cmoilcgeq389cqo0f7wk908dj';
```

---

## 4. CLOUDFLARE R2 CDN ERİŞİMİ

Saldırganın yüklediği SVG dosyaları burada barındırılmaktadır.

```
Platform:     Cloudflare R2
Bucket:       sapphire-patterns
Domain:       cdn.sapphiresc.com
Account ID:   9190027a791eb133e0ea03eecb7204fd

Saldırgan dosyaları dizini:
patterns/cmoilcgeq389cqo0f7wk908dj/
```

---

## 5. OTOMATİK DOĞRULAMA

Delil paketindeki script ile tüm üçüncü parti deliller otomatik doğrulanabilir:

```bash
# Herhangi bir Linux/Mac bilgisayarda çalıştırılabilir:
tar xzf SAPPHIRE_EVIDENCE_PACKAGE.tar.gz
cd evidence/
bash BAGIMSIZ_DOGRULAMA.sh
```

Bu script 8 farklı üçüncü parti kaynağa bağımsız sorgular yaparak
delillerin gerçekliğini doğrular. Şikayet eden tarafın bu kaynaklar
üzerinde hiçbir kontrolü yoktur.

---

## 6. KRİTİK SÜRE UYARILARI

| Kaynak | Son Tarih | Risk |
|--------|-----------|------|
| Webhook.site token | 5 Mayıs 2026 14:19 UTC | Token silinir, IP kaydı kaybolur |
| Railway logları | ~7 gün | Eski loglar otomatik silinir |
| AIT sunucusu (84.44.79.182) | Belirsiz | AIT kapatabilir/değiştirebilir |
| CDN SVG dosyaları | Belirsiz | Silinebilir |

**Tüm bu kaynakların yerel yedekleri evidence/ klasöründe SHA-256 hash ile korunmuş olarak mevcuttur.**

---

## 7. İLETİŞİM

| Kişi | Rol | İletişim |
|------|-----|----------|
| Ali İlçel | Şikayet eden / Platform sahibi | @SovranAMR |
| Railway Inc. | Cloud platform sağlayıcı | railway.app |
| Webhook.site | Callback servisi | webhook.site (Danimarka) |
| Cloudflare Inc. | CDN sağlayıcı | cloudflare.com |
| Vodafone Turkey | Saldırgan IP'nin ISP'si | abuse@vodafone.net.tr |

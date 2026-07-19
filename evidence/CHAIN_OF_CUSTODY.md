# DELİL ZİNCİRİ (CHAIN OF CUSTODY)
## Sapphire B2B Siber Saldırı — Dosya No: SAP-CYBER-2026-0428-001-R3

---

## 1. Olay Bilgileri

| Alan | Değer |
|------|-------|
| **Olay Tarihi** | 28 Nisan 2026, 13:01-15:15 UTC (16:01-18:15 TR) |
| **Hedef Sistem** | sapphiresc.com (Sapphire B2B Platform) |
| **Saldırgan IP** | 84.44.79.182 (Bursa, TR — Vodafone/Borusan Telekom) |
| **Saldırgan IP Teyit** | aitools.ait.com.tr origin sunucusu = A.I.T. Bilg. Sis. |
| **Şüpheli Firma** | A.I.T. Bilgisayar Sistemleri Mak. San. Tic. Ltd. Şti. |
| **Şüpheli Şahıs** | Hakan Özgür (CEO, A.I.T.) |

---

## 2. Delil Toplama Koşulları

| Alan | Değer |
|------|-------|
| **Toplama Tarihi** | 28 Nisan 2026, 20:00-20:10 UTC+3 |
| **Toplama Yöntemi** | Otomatik adli bilişim script'leri |
| **Toplayan Sistem** | Sov AI Forensics (Cursor IDE + CLI araçları) |
| **Toplama Ortamı** | Linux 6.17.0 / Ubuntu, yetkili kullanıcı oturumu |
| **Bütünlük Kontrolü** | SHA-256 hash — tüm dosyalar için |
| **Delil Koruma** | Read-only arşivlenecek |

---

## 3. Delil Envanteri

### 3.1 Sunucu Logları (01-server-logs/)

| Dosya | Açıklama | Boyut | Kayıt Sayısı |
|-------|----------|-------|-------------|
| D001-full-railway-logs-48h.json | 48 saatlik tam Railway logları | 731 KB | 5000 satır |
| D002-attacker-filtered-logs.json | Saldırgan user ID ile filtrelenmiş | 15 KB | 71 kayıt |
| D003-ssrf-logs.json | SSRF/ECONNREFUSED/IMDS logları | 20 KB | 135 kayıt |
| D004-unauthorized-access-logs.json | Yetkisiz admin erişim denemeleri | 1 KB | 5 kayıt |

**Kaynak:** Railway CLI (`railway logs --lines 5000 --since 48h --json`)
**Zaman Aralığı:** 26-28 Nisan 2026

### 3.2 Veritabanı Dökümü (02-database-dumps/)

| Dosya | Açıklama | Boyut | Kayıt Sayısı |
|-------|----------|-------|-------------|
| D005-user-record.csv | Saldırgan User tablosu kaydı | 286 B | 1 kayıt |
| D006-pattern-records.csv | Saldırganın oluşturduğu pattern'ler | 2 KB | 4 kayıt |
| D007-credit-records-257.csv | Tüm credit hareketleri | 31 KB | 257 kayıt |
| D008-apikey-records.csv | Oluşturulan API anahtarları | 566 B | 2 kayıt |

**Kaynak:** PostgreSQL veritabanı doğrudan sorgusu (`psql --csv`)
**Veritabanı:** Railway PostgreSQL (yamabiko.proxy.rlwy.net)

### 3.3 Webhook.site Delilleri (03-webhook-evidence/)

| Dosya | Açıklama | Boyut |
|-------|----------|-------|
| D009-webhook-token-info.json | Token oluşturan IP: 84.44.79.182 | 784 B |
| D010-webhook-all-27-requests.json | 27 HTTP isteğinin tam kaydı (IP, headers, timestamp) | 40 KB |

**Kaynak:** Webhook.site REST API
**Token:** e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3
**Kritik:** Token oluşturan IP (84.44.79.182) = saldırganın gerçek IP'si

### 3.4 WHOIS/DNS Sorguları (04-whois-dns/)

| Dosya | Açıklama | Boyut |
|-------|----------|-------|
| D011-whois-84.44.79.182-attacker-ip.txt | Saldırgan IP RIPE WHOIS kaydı | 1.5 KB |
| D012-whois-ait.com.tr.txt | A.I.T. domain WHOIS | 869 B |
| D013-whois-mirab2b.com.txt | MiraB2B domain WHOIS | 6 KB |
| D014-whois-zenmira.com.txt | Zenmira domain WHOIS | 5 KB |
| D015-whois-deltajohnsons.com.txt | Saldırgan e-posta domain WHOIS | 6 KB |
| D016-dns-records-all-domains.txt | Tüm domain'lerin A/NS/MX kayıtları | 1 KB |
| D017-ipinfo-84.44.79.182.json | IPinfo geolocation: Bursa, TR | 295 B |
| D018-ipapi-84.44.79.182.json | ip-api geolocation + güvenlik analizi | 615 B |

**Kaynak:** RIPE WHOIS, Nic.tr, ARIN, IPinfo.io, ip-api.com, dig

### 3.5 Saldırgan Sunucu Snapshot'ları (05-attacker-server-snapshots/)

| Dosya | Açıklama | Boyut |
|-------|----------|-------|
| D019-...port5000-aitools-ait.html | Port 5000: "AI Pattern Generator" (aitools.ait.com.tr) | 2.7 KB |
| D020-...port5001-ait-archivist-login.html | Port 5001: "Archivist" AIT login paneli | 2.9 KB |
| D021-ait-logo-from-attacker-server.png | AIT logosu (saldırgan sunucusundan indirildi) | 88 KB |
| D022-http-headers-all-ports.txt | Port 80/443/5000/5001 HTTP header kayıtları | 1.7 KB |
| D023-shodan-internetdb.json | Shodan InternetDB tarama sonucu | 177 B |

**Kaynak:** curl ile doğrudan 84.44.79.182 erişimi
**KRİTİK:** Bu dosyalar, saldırgan IP'nin A.I.T.'ye ait olduğunu kanıtlar

### 3.6 CDN Artefaktları (06-cdn-artifacts/)

| Dosya | Açıklama | Boyut |
|-------|----------|-------|
| D024-ssrf-proof.svg | Saldırganın yüklediği "SSRF Proof" SVG | 661 B |
| D025-ssrf-data-exfil-proof.svg | Saldırganın yüklediği data exfil kanıt SVG | 5.1 KB |
| D026-upscale-1.png | Saldırganın upscale ettiği görüntü #1 | 3.7 KB |
| D027-upscale-2.png | Saldırganın upscale ettiği görüntü #2 | 244 B |

**Kaynak:** cdn.sapphiresc.com (Cloudflare R2)

### 3.7 OSINT (07-osint/)

| Dosya | Açıklama | Boyut |
|-------|----------|-------|
| D028-github-hozgur-profile.json | Hakan Özgür GitHub profili | 293 B |
| D029-github-hozgur-repos.json | 52 public repo listesi | 11 KB |
| D030-ait.com.tr-homepage.html | A.I.T. web sitesi ana sayfa | 166 KB |
| D031-ait-hakan-ozgur-profile.html | Hakan Özgür biyografi sayfası | 148 KB |
| D032-mirab2b-homepage.html | MiraB2B web sitesi | 3 B |

**Kaynak:** GitHub API, curl ile web siteleri

---

## 4. Bütünlük Doğrulaması

Tüm delil dosyalarının SHA-256 hash'leri `08-hashes/SHA256SUMS.txt` dosyasında kayıtlıdır.

**Doğrulama komutu:**
```
cd evidence/
sha256sum -c 08-hashes/SHA256SUMS.txt
```

Herhangi bir dosyada değişiklik yapıldığında hash uyuşmazlığı tespit edilecektir.

---

## 5. Delil Bütünlüğü Beyanı

Bu delil paketindeki tüm dosyalar:

1. 28 Nisan 2026 tarihinde, olay tespitinin ardından derhal toplanmıştır
2. Orijinal kaynaklarından (Railway, PostgreSQL, Webhook.site, WHOIS, DNS, Shodan, GitHub, CDN) doğrudan alınmıştır
3. Hiçbir delil üzerinde değişiklik/düzenleme yapılmamıştır
4. SHA-256 kriptografik hash ile bütünlükleri kayıt altına alınmıştır
5. Delil toplama sırasında kullanılan tüm komutlar ve yöntemler bu belgede açıklanmıştır

---

## 6. İmza

| | |
|---|---|
| **Delil Toplayan** | Sov AI Forensics (Otomatik Adli Bilişim Sistemi) |
| **Denetleyen** | Ali İlçel (@SovranAMR) |
| **Tarih** | 28 Nisan 2026 |
| **Dosya Sayısı** | 33 delil dosyası + 1 hash dosyası + 1 rapor |

# DELİL BÜTÜNLÜK DOĞRULAMA REHBERİ
## Sapphire B2B Siber Saldırı — SAP-CYBER-2026-0428-001-R3

---

## Arşiv Dosyası

| Alan | Değer |
|------|-------|
| **Dosya** | `SAPPHIRE_EVIDENCE_PACKAGE.tar.gz` |
| **SHA-256** | `25626733fb4dac5f4405c5c788d9da94ef8956519b87dd4cf4050cefea86b837` |
| **Boyut** | 322 KB |
| **İçerik** | 35 delil dosyası, 8 klasör |
| **Oluşturma** | 28 Nisan 2026, 20:06 UTC+3 |

---

## Doğrulama Adımları

### Adım 1: Arşiv Bütünlüğü
```bash
sha256sum SAPPHIRE_EVIDENCE_PACKAGE.tar.gz
# Beklenen: 25626733fb4dac5f4405c5c788d9da94ef8956519b87dd4cf4050cefea86b837
```

### Adım 2: Arşivi Aç
```bash
tar -xzf SAPPHIRE_EVIDENCE_PACKAGE.tar.gz
```

### Adım 3: Dosya Bütünlüğü
```bash
cd evidence/
sha256sum -c 08-hashes/SHA256SUMS.txt
# Tüm dosyalar "OK" dönmeli
```

---

## Delil Dosyaları ve Anlamları (Bilirkişi Rehberi)

### KRİTİK DELİLLER (Saldırgan-AIT Bağlantısı)

| # | Dosya | Ne Kanıtlar |
|---|-------|-------------|
| D009 | webhook-token-info.json | **Saldırganın IP: 84.44.79.182** — token oluşturan kişi |
| D010 | webhook-all-27-requests.json | Saldırganın 5 bağlantısı (curl + Firefox), Sapphire'ın 15 SSRF callback'i |
| D017 | ipinfo-84.44.79.182.json | **IP geolocation: Bursa, Türkiye** |
| D018 | ipapi-84.44.79.182.json | **proxy=false** (VPN yok), **hosting=false** (gerçek ISP), ISP=Vodafone |
| D019 | port5000-aitools-ait.html | **84.44.79.182 = aitools.ait.com.tr** → A.I.T.'nin sunucusu |
| D020 | port5001-ait-archivist-login.html | **AIT logolu** admin paneli aynı IP'de |
| D021 | ait-logo-from-attacker-server.png | **A.I.T. logosu** saldırgan sunucusundan indirildi |
| D012 | whois-ait.com.tr.txt | **ait.com.tr = A.I.T. Bilgisayar Sistemleri Ltd. Şti.** |
| D011 | whois-84.44.79.182.txt | IP bloğu: 84.44.79.176/29, Vodafone Turkey (AS15924) |

### SALDIRI DELİLLERİ

| # | Dosya | Ne Kanıtlar |
|---|-------|-------------|
| D001 | full-railway-logs-48h.json | Tüm sunucu logları — saldırı izleri |
| D002 | attacker-filtered-logs.json | Saldırgana özel 71 log girişi |
| D003 | ssrf-logs.json | 135 SSRF olayı (port scan, IMDS, webhook callback) |
| D004 | unauthorized-access-logs.json | Admin paneline yetkisiz erişim denemeleri |
| D024 | ssrf-proof.svg | Saldırganın kendisinin yüklediği "SSRF Proof" — keşfedilen servisler |
| D025 | ssrf-data-exfil-proof.svg | Saldırganın yüklediği data dump — çalınan veri kanıtı |
| D007 | credit-records-257.csv | 257 credit işlemi — +15,100 credit hırsızlığı |
| D008 | apikey-records.csv | "admin" scope API key — kalıcı erişim (persistence) girişimi |

### BAĞLANTI DELİLLERİ (AIT → MiraB2B → Rakip)

| # | Dosya | Ne Kanıtlar |
|---|-------|-------------|
| D013 | whois-mirab2b.com.txt | MiraB2B sahibi: Zenmira Bilgi Teknolojileri A.Ş. |
| D014 | whois-zenmira.com.txt | Aynı Cloudflare hesabı (aynı NS sunucuları) |
| D029 | github-hozgur-repos.json | Hakan Özgür: AI framework, CLI tools, Miracle.js, aitsisui |
| D031 | ait-hakan-ozgur-profile.html | Hakan Özgür = AIT CEO |

---

## Bağımsız Doğrulama İçin Komutlar

Bilirkişi, aşağıdaki komutlarla delilleri bağımsız olarak doğrulayabilir:

### IP → AIT Bağlantısı
```bash
# Bu komut, 84.44.79.182:5000'de AIT'nin uygulamasını gösterir
curl -s http://84.44.79.182:5000/ | grep -o "aitools.ait.com.tr"
# Beklenen çıktı: aitools.ait.com.tr

# AIT logosu
curl -s http://84.44.79.182:5001/panel | grep -o "AIT"
```

### Geolocation
```bash
curl -s "https://ipinfo.io/84.44.79.182/json" | python3 -m json.tool
# Beklenen: city=Bursa, country=TR
```

### Webhook.site Saldırgan IP
```bash
curl -s "https://webhook.site/token/e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Token creator IP: {d[\"ip\"]}')"
# Beklenen: 84.44.79.182
```

### WHOIS
```bash
whois 84.44.79.182 | grep -E "netname|descr|country"
whois ait.com.tr | grep -i "registrant"
```

---

## Uyarılar

1. Webhook.site token'ı (e9da1ee6...) **5 Mayıs 2026**'da süresi dolacak — acil koruma altına alınmalı
2. 84.44.79.182 üzerindeki servisler kapatılabilir — snapshot'lar delil niteliğinde
3. CDN dosyaları (D024-D027) silinebilir — yerel kopyalar delildir
4. Tüm online kaynaklar değişebilir — bu arşivdeki kopyalar orijinal anlık görüntülerdir

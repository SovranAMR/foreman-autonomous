# aitools.ait.com.tr — Saldırı Sonrası DNS Değişikliği Kanıtı

**Tespit Tarihi:** 4 Mayıs 2026, 18:49 UTC+3

## 28 Nisan 2026 (Saldırı Günü)
- aitools.ait.com.tr → **84.44.79.182** (direkt IP, Vodafone Bursa)
- Port 5000: "AI Pattern Generator" çalışıyor (Vue.js + Vite)
- Port 5001: "Archivist" admin paneli çalışıyor (AIT logolu)
- Kaynak: evidence/05-attacker-server-snapshots/D019, D020

## 4 Mayıs 2026 (Bugün — Saldırıdan 6 Gün Sonra)
- aitools.ait.com.tr → **172.67.211.131 / 104.21.77.206** (Cloudflare proxy)
- IPv6: 2606:4700:3031::6815:4dce / 2606:4700:3030::ac43:d383
- Site: **403 Forbidden** (kapatılmış)
- Eski IP (84.44.79.182): Port 5000, 5001, 80 → **BAĞLANTI REDDEDILDI** (kapatılmış)

## Değerlendirme
A.I.T., saldırı tespit edilip kendilerine bildirilmesinin ardından:
1. Saldırgan IP'yi (84.44.79.182) Cloudflare proxy arkasına gizlemiş
2. Üzerinde çalışan servisleri (AI Pattern Generator, Archivist) kapatmış
3. Siteyi 403 Forbidden yaparak erişimi engellemiş

Bu davranış, delil karartma girişimi olarak değerlendirilebilir.
Ancak saldırı günündeki snapshot'lar (D019, D020, D021) ve Shodan kaydı (D023)
elimizde SHA-256 hashli olarak arşivlenmiştir.

## Shodan (4 Mayıs 2026 — hala kayıtlı)
84.44.79.182: Port 80 ve 5000 açık olarak kayıtlı (Shodan güncellemesi henüz yansımamış)
cpe:/a:f5:nginx

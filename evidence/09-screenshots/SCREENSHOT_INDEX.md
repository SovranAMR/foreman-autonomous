# Ekran Görüntüsü Delil İndeksi
**Tarih:** 29 Nisan 2026
**Toplayan:** Ali İlçel (Sapphire B2B sahibi)
**Kaynak:** Cloudflare Dashboard, Railway Logs

---

## Kronolojik Sıra

| # | Dosya | Saat (UTC+3) | İçerik |
|---|-------|-------------|--------|
| 1 | `SS-001_1223_cloudflare-ilk-tespit.png` | 12:23 | Cloudflare Security Analytics — saldırının ilk tespiti, HTTP methods ve ülke dağılımı |
| 2 | `SS-002_1225_cloudflare-saldiri-detay.png` | 12:25 | Cloudflare — saldırı detayları, istek tipleri |
| 3 | `SS-003_1229_cloudflare-analitik.png` | 12:29 | Cloudflare Analytics — trafik anomalisi görünümü |
| 4 | `SS-004_1230_cloudflare-ip-detay.png` | 12:30 | Cloudflare — saldırgan IP detayları |
| 5 | `SS-005_1245_saldiri-loglari.png` | 12:45 | Saldırı logları — aktif SSRF/export denemeleri |
| 6 | `SS-006_1246_saldiri-devam.png` | 12:46 | Saldırının devamı — yeni hesap açma + export |
| 7 | `SS-007_1247_saldiri-detay-2.png` | 12:47 | Saldırı detay — path traversal, credential harvest |
| 8 | `SS-008_1250_saldiri-aktivite.png` | 12:50 | Aktif saldırı aktivitesi — curl/8.12.1 parmak izi |
| 9 | `SS-009_1251_saldiri-istek-detay.png` | 12:51 | İstek detayları — API endpoint'lere yapılan saldırılar |
| 10 | `SS-010_1258_cloudflare-security-analytics.png` | 12:58 | Cloudflare Security Analytics — kapsamlı görünüm |
| 11 | `SS-011_1341_saldiri-devam-analiz.png` | 13:41 | Saldırı devam ediyor — güvenlik önlemleri sonrası analiz |
| 12 | `SS-012_1342_cloudflare-waf-detay.png` | 13:42 | Cloudflare WAF — engellenen istekler detayı |
| 13 | `SS-013_1347_env-secrets-denemesi.png` | 13:47 | `.env`, Kubernetes secrets, GitHub workflow secrets erişim denemeleri |
| 14 | `SS-014_1349_credential-harvest-denemesi.png` | 13:49 | Credential harvesting girişimleri — .git, config dosyaları |
| 15 | `SS-015_1350_cloudflare-analytics-son-durum.png` | 13:50 | Son durum — Cloudflare Analytics, Tor trafiği, ASN bilgileri, curl/8.12.1 user-agent |
| 16 | `SS-016_1353_romanya-ip-env-denemesi.png` | 13:53 | Romanya IP (2.57.122.173) — `/docker/.env`, `/production/.env`, `/config/.env.production` erişim denemeleri, ASN 47890 UNMANAGED LTD, OnePlus Android user-agent |
| 17 | `SS-017_1353_kronolojik-saldiri-listesi.png` | 13:53 | Kronolojik saldırı listesi — `/api/auth/csrf`, `/api/auth/callback/credentials`, `/api/auth/session`, `/api/export`, `/robots.txt`, `/r`, `.env` dosyaları, `/kubernetes/secrets`, `/github/workflows/secrets`, Tor + Romanya IP'leri birlikte |

---

## Ortak Bulgular (tüm SS'lerde görülen)

- **User-Agent**: `curl/8.12.1` — tüm isteklerde aynı, otomasyon scripti kanıtı
- **Kaynak ülkeler**: Türkiye (TR), Almanya (DE), Romanya (RO), Tor (T1), ABD (US), Belçika (BE)
- **ASN'ler**: 60729 (Stiftung Erneuerbare Freiheit — Tor exit node), yerel ISP'ler
- **Hedef endpoint'ler**: `/api/export`, `/api/auth/register`, `/api/designs`, `/.env`, `/.git`
- **Saldırı vektörleri**: SSRF, XSS (SVG), Path Traversal, Credential Harvesting, RCE (Gopher)

---

## Delil Bütünlüğü

Bu ekran görüntüleri Ali İlçel tarafından Cloudflare Dashboard ve Railway konsolundan
29 Nisan 2026, 12:23–13:53 UTC+3 arası canlı olarak alınmıştır.

Cloudflare tarafında aynı veriler `Security > Analytics > Sampled Logs` bölümünden
zaman filtresi uygulanarak bağımsız olarak doğrulanabilir.

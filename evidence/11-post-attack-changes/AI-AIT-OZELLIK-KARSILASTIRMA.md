# ai.ait.com.tr — Saldırı Sonrası Özellik Karşılaştırma Raporu

**Tespit Tarihi:** 4 Mayıs 2026, 20:05 UTC+3
**İki defa doğrulandı:** DNS, WHOIS, Schema.org, sitemap, sayfa içerikleri

## Domain Doğrulama

| Bilgi | Değer |
|-------|-------|
| Domain | ai.ait.com.tr |
| WHOIS (ait.com.tr) | Turkticaret.Net üzerinden kayıtlı |
| Schema.org organizasyon | "AIT AI Tools" |
| E-posta | info@ait.com.tr |
| Adres | Alaaddinbey Mh, Nilüfer, Bursa, 16120 |
| Instagram | @miraclesoftware |
| LinkedIn | /company/aitsis/ |
| Wayback Machine | **HİÇ kayıt yok** — domain yeni açılmış |

## Zaman Çizelgesi

| Tarih | Olay |
|-------|------|
| 2026-04-24 | /pricing/ sayfası yayınlandı |
| 2026-04-27 | /textile-ai-tools/ ana sayfa yayınlandı (saldırıdan **1 gün önce**) |
| 2026-04-28 | **Sapphire B2B'ye saldırı başladı** |
| 2026-04-29 | Saldırı devam etti (Tor, RCE, XSS) |
| 2026-05-04 | Tüm alt sayfalar güncellendi (upscaler, vectorizer dahil) |

## Özellik Karşılaştırma

| Özellik | Sapphire B2B | aitools.ait.com.tr (eski) | ai.ait.com.tr (yeni) | Saldırıda kullanıldı mı? |
|---------|-------------|--------------------------|---------------------|------------------------|
| AI Pattern Generator | ✅ | ✅ (vardı) | ✅ | Evet (134 desen) |
| Vectorizer | ✅ | ❌ YOK | ✅ **YENİ** | Evet (incelendi) |
| Upscaler (8K/15K) | ✅ (8K) | ❌ YOK | ✅ **YENİ** (15K) | Evet (6 upscale) |
| Repeater (seamless) | ✅ | ❌ YOK | ✅ **YENİ** | Evet (incelendi) |
| Export (TIFF/PDF/PSD) | ✅ | ❌ YOK (sadece jsPDF) | Belirsiz | Evet (58 export) |
| Color Separation | ❌ | ❌ | ✅ | Hayır |
| Background Remover | ❌ | ❌ | ✅ | Hayır |
| Style Transfer | ❌ | ❌ | ✅ | Hayır |
| 2D/3D Mockup | ❌ | ❌ | ✅ | Hayır |
| Pattern Extractor | ❌ | ❌ | ✅ | Hayır |
| Credit sistemi | ✅ | ❌ | Belirsiz | Evet (+15.100 manipülasyon) |

## Kritik Upload Tarihleri (wp-content/uploads/)

- `uploads/2024/10/upscaler.webp` — görseli 2024'te yüklemişler ama sayfa 2026-04'te yayınlandı
- `uploads/2025/07/Vectorizer-ai.png` — görseli 2025'te yüklemişler ama sayfa 2026-04'te yayınlandı  
- `uploads/2026/03/` — Mart 2026'da yoğun içerik yüklemesi
- `uploads/2026/04/` — Nisan 2026'da logo ve blog yazıları

**Not:** Upload tarihleri görsellerin ne zaman sunucuya yüklendiğini gösterir,
sayfaların ne zaman yayınlandığını değil. Sitemap tarihleri kesindir:
- /textile-ai-tools/ **27 Nisan 2026** — saldırıdan 1 gün önce
- /pricing/ **24 Nisan 2026** — saldırıdan 4 gün önce

## Değerlendirme

1. AIT, saldırıdan **1 gün önce** ai.ait.com.tr'de yeni ürün sayfalarını yayınlamış
2. Sapphire'da olan ama AIT'de **olmayan** vectorizer, upscaler, repeater özellikleri
   artık ai.ait.com.tr'de mevcut
3. Saldırıda bu özelliklerin hepsi aktif olarak kullanılmış/incelenmiş
4. Eski site (aitools.ait.com.tr) kapatılmış, yeni site (ai.ait.com.tr) açılmış
5. Wayback Machine'de ai.ait.com.tr için **hiç arşiv yok** — site yeni

Bu bulgular, saldırının amacının rakip ürün geliştirmek için teknik istihbarat
toplamak olduğuna dair kuvvetli delil oluşturmaktadır.

## Delil Dosyaları

- ai-ait-com-tr-anasayfa-4mayis2026.html (181 KB)
- ai-ait-upscaler-sayfasi-4mayis2026.html (137 KB)
- ai-ait-vectorizer-sayfasi-4mayis2026.html (135 KB)
- ai-ait-textile-tools-4mayis2026.html (182 KB)
- ai-ait-pricing-4mayis2026.html (147 KB)
- ai-ait-sitemap-4mayis2026.xml (78 KB)
- Tümü SHA-256 hashli, 08-hashes/SHA256SUMS.txt'de kayıtlı

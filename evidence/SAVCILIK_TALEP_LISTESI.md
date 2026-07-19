# SAVCILIK DİLEKÇESİ — TALEP LİSTESİ
## Sapphire B2B Siber Saldırı — SAP-CYBER-2026-0428-001

Aşağıdaki talepler, suç duyurusu dilekçesine eklenecek resmi
inceleme ve delil toplama talepleridir.

---

## İlgili Suç Maddeleri

- **TCK 243** — Bilişim sistemine hukuka aykırı girme veya orada kalma
- **TCK 244** — Sistemi engelleme/bozma, verileri yok etme/değiştirme/
  erişilmez kılma veya veri yerleştirme
- **TTK 54-55** — Haksız rekabet (dürüstlük kuralına aykırı davranış)
- **6698 KVKK** — Kişisel verilere erişim teşebbüsü (varsa)

---

## Resmi İnceleme Talepleri

### 1. BTK / Vodafone — IP Abone Bilgisi
```
Talep: 84.44.79.182 IP adresinin 28 Nisan 2026 tarihinde
       12:00–16:00 UTC saatleri arasındaki abone/hat bilgileri
Kurum: BTK → Vodafone Net İletişim Hizmetleri A.Ş.
       Abuse: abuse@vodafone.net.tr
       ASN: AS15924
Amaç: IP'nin hangi gerçek/tüzel kişiye tahsis edildiğinin
      resmi tespiti
```

### 2. Webhook.site — Token Kayıtları
```
Talep: Token ID e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3 için
       token oluşturma kaydı ve tüm gelen isteklerin kaydı
Kurum: Webhook.site (Danimarka — uluslararası adli yardım talebi)
Amaç: Token oluşturan IP'nin ve callback kayıtlarının resmi teyidi
⚠️ ACIL: Token 5 Mayıs 2026 14:19 UTC'de sona erecektir
```

### 3. Cloudflare — Erişim Logları
```
Talep: sapphiresc.com domain'ine 28 Nisan 2026 tarihinde
       12:00–16:00 UTC arasında yapılan isteklerin erişim logları
       (kaynak IP, request URL, timestamp)
Kurum: Cloudflare Inc. (San Francisco, ABD)
Amaç: Saldırganın sapphiresc.com'a erişim IP'sinin teyidi
```

### 4. Railway — HTTP Erişim Logları
```
Talep: sapphire-b2b projesi (ID: df41edef-612e-4268-b573-8b3a38d88dbf)
       için 28 Nisan 2026 tarihli HTTP erişim logları
       (özellikle X-Forwarded-For header'ları)
Kurum: Railway Inc. (San Francisco, ABD)
Amaç: Cloudflare arkasındaki gerçek client IP teyidi
```

### 5. A.I.T. Bilgisayar Sistemleri — Sunucu İncelemesi
```
Talep: 84.44.79.182 IP'sindeki sunucu/bilgisayar üzerinde:
       - Olay saatindeki erişim logları (nginx, application, shell)
       - curl komut geçmişi (.bash_history)
       - Browser geçmişi (Firefox profil verileri)
       - Deployment logları
       - Kullanıcı oturumları (hangi kullanıcı aktifti)
       - Disk imajı alınması
Kurum: A.I.T. Bilgisayar Sistemleri Mak. San. Tic. Ltd. Şti.
       Alaaddinbey Mh. 639. Sk. No:2/A Nilüfer/Bursa
Amaç: Saldırıyı gerçekleştiren şahsın tespiti
Not: Arama ve elkoyma kararı gerektirebilir
```

### 6. A.I.T. — Çalışan ve Mesai Kayıtları
```
Talep: 28 Nisan 2026 tarihinde:
       - Mesaide bulunan çalışan listesi
       - Giriş/çıkış kayıtları (kart geçiş, kamera vb.)
       - 84.44.79.182 sunucusuna erişim yetkisi olan kişiler
Kurum: A.I.T. Bilgisayar Sistemleri
Amaç: Olay saatinde sunucuya fiziksel/uzaktan erişimi olan
      kişilerin daraltılması
```

### 7. Telefon Operatörü — HTS Kayıtları
```
Talep: 28 Nisan 2026 tarihinde A.I.T. firmasından
       (0224 211 43 60) Sapphire Eşarp'a yapılan arama kaydı
Kurum: BTK / İlgili operatör
Amaç: Saldırı öncesi "hedef teyidi" niteliğindeki telefon
      aramasının belgelenmesi
```

---

## Acil Koruma Talepleri

| Kaynak | Son Tarih | Talep |
|--------|-----------|-------|
| Webhook.site token | 5 Mayıs 2026 | Sona ermeden resmi teyit veya koruma kararı |
| A.I.T. sunucusu | Belirsiz | İçerik değiştirilmeden disk imajı alınması |
| Railway logları | ~7 gün | Log retention süresi dolmadan yedekleme |

---

## Ek Notlar

1. Şikayet eden taraf, mevcut delilleri SHA-256 kriptografik hash ile
   koruma altına almıştır. Delil bütünlüğü doğrulanabilir.

2. Karşı tarafla doğrudan iletişim kurulmamıştır (WhatsApp, telefon,
   sosyal medya vb.). Bu, delil karartma riskini önlemek amacıyladır.

3. Şikayet eden taraf, olay tespitinin ardından yalnızca güvenlik
   önlemleri almış (hesap devre dışı bırakma, API key iptal) ve delil
   toplama yapmıştır. Karşı tarafa yönelik herhangi bir tarama, sızma
   testi veya aktif saldırı girişimi gerçekleştirilmemiştir.

4. 84.44.79.182 IP'sindeki açık portlar (5000, 5001) üzerindeki web
   içerikleri, standart HTTP GET istekleri ile erişilmiştir. Bu,
   herkesin erişebileceği açık web servislerine normal erişimdir ve
   yetkisiz giriş niteliği taşımamaktadır.

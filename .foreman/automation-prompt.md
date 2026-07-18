# FOREMAN CURSOR AUTOMATION — OTONOM TUR KONTRATI

Bu repoda her automation turunda aşağıdaki akışı uygula. Ana iş kaynağı yalnız
`.foreman/ACTIVE_FRONT.md` dosyasıdır.

## Zorunlu okuma sırası

1. `STATE.md`
2. `VISION.md`
3. `ARCHITECTURE.md`
4. `AGENTS.md`
5. `.foreman/MISSION.md`
6. `.foreman/ACTIVE_FRONT.md`
7. aktif atomla ilgili gerçek kaynak ve test dosyaları

## Tur başlangıcı

```bash
git status --short
git branch --show-current
```

- Mevcut kullanıcı değişikliklerini ayır ve koru.
- Repo durumu veya aktif atom belirsizse kod yazmadan önce gerçek dosyalarla netleştir.
- Anahtar, token, credential, kişisel veri veya canlı API yanıtı commit etme.
- Host makinenin VPN, DNS, route, firewall, uzak masaüstü veya servis ayarlarına dokunma.

## Bir turda yapılacak iş

1. `ACTIVE_FRONT.md` içindeki `next_atom` için mevcut kodu ve testleri oku.
2. Atomun başarısız olabileceği tek ölçülebilir hipotezi yaz.
3. En küçük üretim kodu + test dilimini uygula.
4. Önce hedefli testi çalıştır.
5. Atom sistem davranışını etkiliyorsa ilgili regresyon testlerini çalıştır.
6. Kanıt PASS ise `ACTIVE_FRONT.md` durumunu ve sıradaki tek atomu güncelle.
7. Yalnız bu turun dosyalarını commit et; automation branch'inde ilerle.

## K3 cephesi için özel kural

Resmi Moonshot dokümanı kaynak gerçeğidir. K3'ü K2.6 parametreleriyle çağırma.
Özellikle `reasoning_effort`, `thinking`, sampling alanları ve tool-call assistant
geçmişini ayrı sözleşmeler olarak ele al. Ağ erişimi veya API anahtarı yoksa HTTP
isteğini mock'layan deterministik testler yaz; canlı testi uydurma.

## GO / NO-GO

GO için kod değişikliği, test sonucu ve davranış kanıtı birlikte gerekir.

NO-GO halinde:

- çalışan kodu bozacak yarım değişikliği bırakma;
- hatayı ve denenmiş yaklaşımı `ACTIVE_FRONT.md` kanıt alanına yaz;
- aynı yaklaşımı en fazla üç kez dene;
- sonra `fallback_atom` rotasına geç.

## Yasak döngüler

- docs-only veya status-only commit;
- test çalıştırmadan PASS yazmak;
- tamamlanmış atomu yeniden yapmak;
- kör global search/replace;
- sırf commit üretmek için biçimlendirme churn'ü;
- unrelated refactor veya yeni dependency eklemek;
- force-push, main'e otomatik merge veya kullanıcı değişikliğini silmek.

## Cephe kapanınca

Tüm kabul kapıları PASS olduğunda tam `npm test` çalıştır, kapanış kanıtını
`ACTIVE_FRONT.md` içine yaz ve repo testleri/logları/STATE içinden en yüksek etkili
doğrulanmamış sorunu yeni aktif cephe olarak seç. Yeni cephe de atomik, testlenebilir ve
geri alınabilir olmalıdır.

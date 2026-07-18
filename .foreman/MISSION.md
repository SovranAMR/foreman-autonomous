# FOREMAN — MISSION CONTROL

## Tek operasyonel gerçek

Güncel iş emri `.foreman/ACTIVE_FRONT.md` dosyasıdır. Cursor Automation her turda önce
`.foreman/automation-prompt.md` dosyasını, ardından `ACTIVE_FRONT.md` dosyasını okur.

## Değişmez hedef

Foreman'ı uzun süre çalışan, gerçek kod üzerinde çalışan ve kendi ilerlemesini kanıtla
yöneten güvenilir bir agent orkestratörü olarak geliştirmek.

Her değişiklik şu sırayı korur:

```text
gerçek repo durumu
→ en küçük tamamlanmamış atom
→ kod + test
→ doğrulama kanıtı
→ ACTIVE_FRONT ilerletme
→ commit
```

## Güncel ana cephe

Moonshot ana sohbet/agent yolunu `kimi-k2.6` sabitinden resmi `kimi-k3` modeline geçir.
Bu yalnız model adını değiştirme işi değildir; K3 istek sözleşmesi, çok adımlı tool-call
geçmişi, model seçimi, testler ve operasyonel belgeler birlikte güncellenmelidir.

Resmi kaynaklar:

- https://platform.moonshot.ai/docs/guide/kimi-k3-quickstart
- https://platform.moonshot.ai/docs/models
- https://platform.moonshot.ai/docs/guide/kimi-k3-tool-calling-best-practice

## Ürün ilkeleri

- Gerçek kodu okumadan varsayım üretme.
- Bir turda bir doğrulanabilir atom tamamla.
- Test geçmeden tamamlandı yazma.
- Hata veya NO-GO sonucunu saklama; kanıtıyla `ACTIVE_FRONT.md` içine yaz.
- Docs-only durum döngüsü, boş commit ve aynı başarısız yaklaşımı tekrarlamak ilerleme değildir.
- Kullanıcı değişikliklerini, sırları ve çalışma makinesinin sistem/ağ ayarlarını koru.
- Ana sohbet modeli ile ucuz arka-plan modeli ayrı karar olabilir; bu ayrımı testle ve belgede açık tut.

## K3 kapanış ölçütü

Cephe ancak `.foreman/ACTIVE_FRONT.md` içindeki tüm kabul kapıları kanıtlı PASS olduğunda
kapanır. Sonra repo testleri/logları içinden en yüksek etkili doğrulanmamış sorunu seç ve
yeni aktif cepheyi aynı dosyaya yaz.

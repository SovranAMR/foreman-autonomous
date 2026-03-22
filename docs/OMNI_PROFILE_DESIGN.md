# Omni Profil ve Takipçi Arayüzü (Omni ID)

## 1. Evrensel Profil Başlığı (Omni ID)
Kullanıcının uygulamada tek bir ana fotoğrafı (Avatar) ve "Omni Kullanıcı Adı" (@kullanici_adi) bulunur. 
Profil fotoğrafının hemen altında, kişinin hangi platformları bağladığını gösteren parlak rozetler yer alır:
* Örn: `[📸 Instagram] [🐦 X] [🎵 TikTok] [👔 LinkedIn]`
* Kullanıcılar, başkasının profiline girdiğinde sadece kendi cihazlarında yüklü/açık olan hesapların içeriğini eşleyebilir.

## 2. Kümülatif Takipçi ve Kitle Gösterimi
Platformların ayrı ayrı takipçi sayılarını vurgulamak yerine "Toplam Etki" (Total Reach) öne çıkarılır.
* **Ana Rakam:** "35.4K Toplam Kitle" (Instagram'daki 20K + X'teki 5.4K + TikTok'taki 10K)
* **Alt Kırılım:** Rakamın üzerine tıklandığında küçük bir Modal (Popup) açılır ve hangi platformdan kaç takipçi olduğu pasta grafik veya liste halinde sunulur.

## 3. Takipçi Listesi Görünümü
Kullanıcı kendi takipçilerine veya başkasının takipçilerine tıkladığında karma bir liste açılır:
* Listede her kişinin isminin yanında, onu hangi platformdan takip ettiğini gösteren ufak bir ikon bulunur (Örn: "Ahmet Yılmaz 📸").
* Eğer "Ahmet Yılmaz" da bir Omni App kullanıcısıysa, isminin yanında "∞" (Omni Verified) rozeti parlar ve tıklandığında direkt o kişinin birleştirilmiş Omni profiline gidilir.
* Eğer Omni kullanıcısı değilse, sadece o platformdaki (örn: Instagram) WebView profil penceresi açılır.

## 4. Karma İçerik Izgarası (Masonry Grid)
Profilin alt kısmı tek bir platformun standart dizilimi yerine "Mozaik" yapıdadır:
* **Tümü (All) Sekmesi:** Tweetler (metin kutuları), Instagram fotoğrafları (kare) ve TikTok videoları (dikey dikdörtgen) Pinterest benzeri asimetrik ama şık bir düzende alt alta akar.
* **Filtre Sekmeleri:** Kullanıcı sadece belirli bir içerik tipini görmek isterse profilin üstündeki platform logolarına dokunarak akışı saniyeler içinde sadece X (Tweetler) veya sadece IG (Fotoğraflar) formatına filtreleyebilir.

## 5. Etkileşim (Takip Etme Aksiyonu)
* Bir Omni kullanıcısının profilindeki ana "Takip Et" (Follow All) butonuna basıldığında, uygulama arka planda (WebView) o kişiyi tüm bağlı platformlarda (X, IG, TikTok) aynı anda takip etme komutu gönderir. 
* İstenirse yanındaki ok (chevron) ikonuna basılıp sadece "Instagram'dan takip et" seçilebilir.

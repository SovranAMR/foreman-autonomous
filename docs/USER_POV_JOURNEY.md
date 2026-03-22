# OMNISOCIAL - Kullanıcı Deneyimi (POV) Yolculuğu

Bu doküman, "OmniSocial" (veya projenizin adı) uygulamasını ilk defa indiren bir kullanıcının bakış açısından (POV) adım adım yaşayacağı deneyimi anlatır. Arka plandaki tüm teknik zorluklar, WebView'lar ve yasal boşluklar kullanıcıdan tamamen gizlenmiştir. 

Kullanıcı için deneyim son derece modern, akıcı ve büyüleyicidir.

## 1. Uygulamayı İndirme ve "Ağları Bağlama" (Onboarding)
Kullanıcı uygulamayı açar. Karşısına şık bir "Dijital Kimliklerini Tek Yerde Topla" ekranı gelir.
- **X, Instagram, TikTok, LinkedIn, Pinterest** logoları belirir.
- Her birine tıkladığında, tıpkı Instagram üzerinden bir bağlantıya tıklamış gibi uygulama içinde bir tarayıcı açılır ve kullanıcı kendi hesaplarına resmi giriş ekranından giriş yapar.
- Şifreler sunucularımıza gitmez (bu kullanıcıya güven verir), sadece cihazındaki gizli tarayıcıda oturum açık kalır.

## 2. "Tekil Akış" (The Unified Feed) - Kaydırma Deneyimi
Girişler tamamlandıktan sonra ana ekrana düşer. Burası sihrin başladığı yerdir.
- Akış, TikTok benzeri akıcı bir dikey kaydırma (veya klasik Instagram akışı) şeklindedir.
- **İlk Gönderi:** X'ten gelen sadece metin içeren bir tweet. Arka planı hafif siyaha çalan şık bir karttadır. Kullanıcı kartı geçer.
- **İkinci Gönderi (Yukarı Kaydırır):** Karşısına Instagram'dan yüksek çözünürlüklü kare bir fotoğraf çıkar. Sol üstte küçük bir Instagram ikonu vardır. Kalp butonuna basar, Instagram'da anında beğenmiş olur.
- **Üçüncü Gönderi (Bir Daha Kaydırır):** Ekranı aniden TikTok'tan dikey, tam ekran, sesli bir video kaplar.
- **Sıralama Mantığı:** Bu gönderilerin sırası tesadüf değildir. İçeriğe entegre ettiğimiz X'in açık kaynak algoritması, kullanıcının en çok ilgi göstereceği karma içerikleri belirleyip tek bir mükemmel zaman tüneli yaratmıştır. 

## 3. "Evrensel Posta Kutusu" (Unified Messenger)
Kullanıcı sağ üstteki mesaj ikonuna tıklar. Karşısına farklı uygulamalardan gelen tüm mesajlar karışık bir liste halinde çıkar:
- En üstte: **Ahmet** (Instagram üzerinden bir reels atmış, yanında IG ikonu). Tıklar, videoyu izler ve "Harika 😂" yazar. Mesaj anında Ahmet'in Instagram DM'sine düşer.
- Altında: **Ayşe** (X DM üzerinden bir haber paylaşmış). Oraya tıklar, X arayüzüne gitmeden direkt sohbet penceresinden yanıt verir.
- En altta: **Patron** (LinkedIn'den iş fırsatı yazmış). Tümü tek bir WhatsApp-vari sade ekrandadır.

## 4. Tek Tıkla Çapraz Paylaşım (Cross-Posting)
Kullanıcı yeni bir içerik üretmek ister. Ortadaki büyük "+" butonuna basar.
- Galeriden bir fotoğraf seçer veya bir metin yazar: *"Bugün hava harika!"*
- Alt tarafta **"Nerelerde paylaşılsın?"** seçenekleri belirir.
- Instagram, X, Facebook, ve LinkedIn ikonlarını seçer.
- **"Gönder"** butonuna basar.
- Uygulama fotoğrafı Instagram için kareye uyarlar, X için metin tweetine ekler, LinkedIn için profesyonel bir formata dönüştürür ve tek tıklamayla 4 platforma aynı anda postalar.

## 5. Kamera Arkası (Kullanıcının Görmediği/Hissettiği Kısımlar)
- **Hız ve Hissiyat:** İlk açılışlarda uygulama arka planda 5 farklı siteye bağlandığı için 1-2 saniyelik "Yükleniyor..." dalgalanmaları görülebilir. Ancak uygulama "Infinite Scroll" (Sonsuz Kaydırma) mantığıyla kullanıcının göreceği bir sonraki gönderiyi o okurken alttan yüklediği için, kullanıcı hiçbir takılma veya bekleme hissetmez. 
- **Adaptasyon:** İçerik formatları (TikTok videoları, IG Reels, X düz yazıları, LinkedIn makaleleri) UI tasarımımız tarafından o kadar güzel çerçevelenir ki, farklı platformlara ait olmalarına rağmen hepsi tek bir "Super-App"in parçası gibi şık durur.
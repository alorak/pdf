# PDF — hızlı ve yerel PDF okuyucu

Tarayıcıda çalışan sade, hızlı ve gizliliğe odaklı bir PDF görüntüleyici. Belgeler bilgisayarından seçilir, sunucuya yüklenmez. Üretim paketi PDF.js'i ve worker dosyasını içerir; uygulama açıldıktan sonra CDN bağlantısı gerekmez.

## Özellikler

- **Open** butonuyla bilgisayardan PDF seçme; sürükle-bırak veya `Ctrl/⌘ + O` da desteklenir.
- **Dikey / yatay sınırsız sayfa akışı** arasında geçiş.
- **%20–%600 hassas zoom**: +/−, kaydırıcı, elle yüzde yazma ve `Ctrl/⌘ + fare tekerleği`.
- **Genişliğe sığdır**, **yüksekliğe sığdır** veya **sayfanın tamamını sığdır**; pencere değiştiğinde yeniden hesaplanır.
- Küçük resimler **solda veya altta**; Ayarlar'dan değiştirilebilir ya da gizlenebilir.
- Sayfa numarasıyla, önceki/sonraki butonlarıyla ve küçük resimlerle gezinti.
- Sol hamburger menüsünden **en fazla 20 çalışma alanı (workspace)** oluşturma ve aralarında geçiş yapma.
- PDF metnini seçip sağ tıklayarak **Kopyala** veya **Workspace'e kaydet** işlemleri.
- Seçilen metinler her workspace'e ayrı olarak localStorage'da kaydedilir; dosya adı ve sayfa bilgisiyle listelenir, tek tek kopyalanabilir/silinebilir.
- **Open PDF** işlemi onay ister. Yeni PDF başarıyla açılınca yalnızca aktif workspace'in eski kayıtları silinir; diğer workspaceler ve görünüm tercihleri korunur.
- **Library**: Sol menüde “Yeni workspace” altında açılır. Sayfanın adı üst araç çubuğunda `pdf.` logosunun yanında görünür; sayfa içinde ayrı başlık veya geri/yenile butonları yoktur. Sol menüden workspace seçerek okuyucuya dönülür. Kompakt tam genişlik ekranında dört depolama göstergesi tek satırda, altında **20 workspace kartı (geniş ekranda iki sıra, her sırada 10 kart)** (henüz oluşturulmamış olanlar dâhil), en altta da yalnızca sahipsiz PDF listesi bulunur. PDF'si olan workspace kartında **PDF'nin ilk sayfası küçük resim** olarak gösterilir. Sahipsiz dosyalar onayla silinebilir.
- **Library yer imi rozetleri**: Oluşturulmuş her workspace kartının PDF önizlemesinin sağ üstünde, aktif PDF'ye ait sayfa ve metin yer imlerinin toplam sayısı yuvarlak rozet içinde gösterilir. Rozete tıklanınca aynı sayfadaki kayıtları birleştiren bir modal açılır; her modal sayfasında **5 farklı PDF sayfası** yer alır. Bir satır seçildiğinde ilgili workspace açılır ve PDF yüklendikten sonra seçilen sayfaya gidilir. Henüz oluşturulmamış workspace yuvalarında rozet bulunmaz.
- **Workspace sayfa derlemesi**: Her workspace kendi PDF'sine ek olarak diğer workspace'lerin PDF'lerindeki seçilmiş sayfaları **bağlantı** olarak tutabilir. Üst çubuktaki **Derleme** görünümünde `+ Sayfa ekle` ile kaynak workspace seçilip `1,3-5` gibi sayfa aralıkları eklenir. Eklenen sayfalar kaynak PDF dosyasından yerel olarak render edilip aynı workspace'in derleme ekranında sıralanır; `Kaynakta aç` ilgili PDF ve sayfaya gider. `Sil` yalnızca bağlantıyı siler, kaynak PDF'yi veya diğer çalışma alanlarının yer imlerini etkilemez. Her workspace için en fazla 100 bağlantılı sayfa tutulur. Kaynak silinir/değişirse bağlantı korunur ama yeni PDF'ye yanlışlıkla uygulanmaz.
- **Depolama görünürlüğü**: PDF toplam boyutu, tüm origin için localStorage UTF-16 boyut tahmini, PDF+localStorage toplamı, `navigator.storage.estimate()` ile tarayıcı origin kotası ve kullanımı; isteğe bağlı kalıcı depolama talebi.
- Tercihler ve kaydedilen metinler localStorage'da tutulur. PDF'ler **IndexedDB'de kalıcı olarak** workspace kimliğiyle saklanır ve sayfa yenilendiğinde yeniden yüklenmeye çalışılır. Tarayıcı verilerini temizlemek veya depolama kotası nedeniyle silinmesi dosyaları kaybettirebilir.
- PDF.js worker, görünür alan bazlı çizim, iptal edilebilir işler ve canvas bellek sınırı.

## Çalıştırma

Node.js 22+ gerektirir (Node.js 24 önerilir).

```bash
npm install
npm run dev
```

Vite'ın verdiği adrese gidin. Üretim paketi ve testler:

```bash
npm test
npm run build
npm run preview
```

Statik çıktı `dist/` klasöründedir. ES module ve worker güvenlik kısıtları nedeniyle doğrudan `file://` ile açmak yerine yerel HTTP sunucusu veya GitHub Pages kullanılmalıdır.

## GitHub Pages

`.github/workflows/pages.yml` testleri çalıştırır ve Pages'e dağıtımı **yalnızca PR birleştirilince** (ya da elle başlatılınca) yapar; güvenilir `main` branch'ini kullanır. Depoda Settings → Pages → Build and deployment → Source: **GitHub Actions** seçilmelidir. Çıktı yolu `/pdf/` olarak ayarlanmıştır.

### Yayında CSS/JS görünmüyorsa

Önce GitHub Pages ayarlarında yayın kaynağının **GitHub Actions** olduğunu doğrulayın. GitHub'ın otomatik `pages build and deployment` (Jekyll) işi, Vite ile derlenmiş `dist/` yerine depo kaynak dosyalarını yayımlarsa tasarım bozulur. Bu işin başarılı olması, PDF görüntüleyicinin doğru yayımlandığı anlamına gelmez.

**Actions → Build and publish PDF viewer → Run workflow → main** üzerinden **yeni** bir çalıştırma başlatın. Mevcut bir çalıştırmanın `Re-run jobs` seçeneği aynı `github-pages` artefaktını tekrar kullanabildiğinden, bu workflow her denemeye farklı bir artefakt adı verir. Son yayın başarılı olduktan sonra sayfayı önbelleği atlayarak yenileyin.

## Klavye kısayolları

| Kısayol | İşlem |
| --- | --- |
| `Ctrl/⌘ + O` | PDF aç |
| `+` / `-` | Yakınlaştır / uzaklaştır |
| `0` | Sayfanın tamamını sığdır |
| `PageDown` / `PageUp` | Sonraki / önceki sayfa |
| `Home` / `End` | İlk / son sayfa |
| `Esc` | Ayarları / menüleri kapat |

## Kapsam

İlk sürüm okuma performansına odaklanır; OCR, not ekleme, metin arama, metin seçimi ve PDF düzenleme içermez. Çok yüksek büyütmelerde tarayıcı belleğini korumak için çizim çözünürlüğü sınırlandırılır. Parolalı PDF'ler için parola girme ekranı henüz yoktur.

PDF işleme motoru: [Mozilla PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0).

Library'deki workspace kartları 20 adet sabit yuva gösterir. Geniş ekranda 10 + 10 yerleşimi uygulanır; PDF önizleme alanları A4 dikey sayfa en-boy oranını (210:297) kullanır. Dar ekranlarda sütun sayısı azaltılır. Boş bir workspace'e dokununca PDF açma akışı, oluşturulmamış bir yuvaya dokununca yeni workspace oluşturma akışı başlar. PDF küçük resimleri, kayıtlı belgelerden PDF.js aracılığıyla talep üzerine üretilir; aynı anda en fazla iki önizleme işlenir ve Library kapanınca bekleyen PDF.js işlemleri iptal edilir. Önizleme üretilemezse PDF kaydı korunur ve kartta bilgi mesajı gösterilir.

## Tarayıcı depolaması

PDF'ler (`pdf-viewer-workspace-files-v1` veritabanının `pdfs` object store'u) IndexedDB'de `workspaceId` anahtarıyla tutulur. Workspace metadata'sı `pdf-viewer-workspaces-v1` localStorage anahtarındadır. Library, dosya ID'sini **ve** adını mevcut workspace bilgileriyle eşleştirir. Silinmiş bir workspace'e ait veya mevcut workspace'in dosya adıyla uyuşmayan kayıtlar “sahipsiz” sayılır. Silme işleminde kayıt kimliği, ad, içerik boyutu ve son değiştirilme zamanı tekrar kontrol edilir.

Library'deki yerel PDF toplamı içerik byte'larını toplar; localStorage tahmini tüm origin'deki anahtar ve değerlerin UTF-16 boyutuna dayanır. Tarayıcının bildirdiği kota ve tahmini kullanım IndexedDB, Cache API ve aynı origin'deki **diğer** uygulamaların depolamasını da kapsayabilir; bu nedenle bu sayıların toplamı birbirine eşit olmak zorunda değildir. Örneğin `https://alorak.github.io/pdf/`, `https://alorak.github.io/` ile aynı origin'dedir.

IndexedDB için evrensel bir maksimum PDF dosya boyutu yoktur. Gerçek kota tarayıcıya, profile, işletim sistemine ve disk durumuna bağlıdır; yer dolduğunda `QuotaExceededError` oluşabilir. **Kalıcı depolama iste** tarayıcı desteklediğinde `navigator.storage.persist()` çağırır; kabul edilmesi, kullanıcının tarayıcı verilerini elle silmesine karşı garanti sağlamaz. İlgili genel bilgiler: [MDN Storage Quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

### Derleme veri modeli

Derleme, PDF dosyalarını fiziksel olarak birleştirmez veya yeni PDF üretmez. Workspace metadata'sındaki `linkedPages` listesi kaynak workspace ID'si, kaynak PDF adı/boyutu/değiştirilme zamanı ve 1 tabanlı sayfa numaralarını saklar. Aynı kaynak sayfa bir hedef workspace'e iki kez eklenmez; farklı hedef workspace'ler birbirinden bağımsızdır. Kaynak PDF IndexedDB'de tek nüsha bulunur. Hedef workspace'in kendi ana PDF'sini değiştirmek derleme bağlantılarını kaldırmaz. Kaynak çalışma alanı silinirse bağlantı kaydı görünmeye devam eder fakat geçersiz olarak işaretlenir ve ancak kullanıcı kaldırırsa silinir. Bağlantılı sayfalarda kaynak PDF'nin yer imleri ve metinleri hedef workspace'e kopyalanmaz.

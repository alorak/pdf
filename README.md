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
- **PDF değiştirme koruması**: PDF seçildikten sonra aynı workspace'in mevcut PDF'siyle içerikleri parça parça karşılaştırılır. Dosyalar aynıysa (ad veya değiştirilme zamanı farklı olsa bile) **yer imleri, metin vurguları ve mevcut PDF korunur; değiştirme onayı açılmaz**. İçerik farklıysa açık uyarı gösterilir. Yeni PDF ve workspace metadata'sı başarıyla kaydedilirse yalnızca o workspace'in eski PDF'si ve yer imleri temizlenir. IndexedDB ya da localStorage başarısız olursa işlemin geri alınması ve eski PDF/yer imlerinin korunması hedeflenir; diğer workspace'ler değişmez.
- **Library**: Sol menüde “Yeni workspace” altında açılır. Sayfanın adı üst araç çubuğunda `pdf.` logosunun yanında görünür; sayfa içinde ayrı başlık veya geri/yenile butonları yoktur. Sol menüden workspace seçerek okuyucuya dönülür. Kompakt tam genişlik ekranında dört depolama göstergesi tek satırda, altında **20 workspace kartı (geniş ekranda iki sıra, her sırada 10 kart)** (henüz oluşturulmamış olanlar dâhil), en altta da yalnızca sahipsiz PDF listesi bulunur. PDF'si olan workspace kartında **PDF'nin ilk sayfası küçük resim** olarak gösterilir. Sahipsiz dosyalar onayla silinebilir.
- **Library yer imi rozetleri**: Oluşturulmuş her workspace kartının PDF önizlemesinin sağ üstünde, aktif PDF'ye ait sayfa ve metin yer imlerinin toplam sayısı yuvarlak rozet içinde gösterilir. Rozete tıklanınca aynı sayfadaki kayıtları birleştiren geniş bir modal açılır; **5 farklı PDF sayfasının gerçek ilk-sayfa değil ilgili sayfa küçük resimleri yan yana, tek yatay sırada** gösterilir. Önceki/Sonraki beşerli sayfalamayı korur; küçük resme tıklamak ilgili PDF sayfasını açar. Dar ekranlarda beşli sıra yatay kaydırılır, dikey listeye dönüşmez. Bir satır seçildiğinde ilgili workspace açılır ve PDF yüklendikten sonra seçilen sayfaya gidilir. Henüz oluşturulmamış workspace yuvalarında rozet bulunmaz.
- **PDF veya sayfa çalışma alanı**: Boş workspace'te **PDF aç** ve **+ Sayfa ekle** birlikte sunulur. İlk seçime göre workspace türü kalıcılaşır: PDF açılırsa normal PDF okuyucu, diğer workspace'lerden sayfa seçilirse **sayfa çalışma alanı** olur. Sayfa çalışma alanına sonradan PDF yüklenemez; yalnızca **+ Sayfa ekle** ile yeni sayfalar eklenir. Kaynak PDF'ler kapak kartlarından, kaynak sayfalar 12'şerli önizleme gruplarından seçilir. Ayrı Derleme sayfası yoktur: seçilen sayfalar **doğrudan normal PDF okuyucuda**, küçük resimler, yakınlaştırma ve yer imleriyle kullanılır. PDF kaynak dosyaları kopyalanmaz; sadece sayfa referansları saklanır. Sayfayı kaldırma işlemi ana okuyucunun küçük resimleri üzerindedir ve kaynak PDF'yi silmez.
- **Depolama görünürlüğü**: PDF toplam boyutu, kalan eski localStorage kayıtlarının UTF-16 boyut tahmini (artık yer imleri IndexedDB'dedir), PDF+localStorage yaklaşık toplamı (IndexedDB metadata hariç), `navigator.storage.estimate()` ile tarayıcı origin kotası ve kullanımı; isteğe bağlı kalıcı depolama talebi.
- **P0 veri güvenliği (IndexedDB v2)**: PDF dosyaları ile workspace metadata'sı, yer imleri, vurgular ve bağlantılı sayfalar artık **aynı IndexedDB veritabanında** saklanır. İlk açılışta eski localStorage workspace kaydı otomatik olarak IndexedDB'ye aktarılır; migration tamamlanmadan eski kayıt silinmez. Metadata kaydı revizyon kontrolüyle yapılır; çoklu sekme değişikliklerinde eski sekmenin yeni kayıtları sessizce ezmesi engellenir. PDF ekleme/değiştirme ve workspace silme PDF+metadata için tek IndexedDB transaction kullanır. Yer imleri, tarayıcı verileri silinirse yine kaybolabileceği için harici yedek önerilir.
- **Tam yedek ve kurtarma**: Library içindeki **Tümünü yedekle** düğmesi bütün workspace'leri, yer imlerini, vurguları, sayfa bağlantılarını ve IndexedDB'deki PDF'leri (sahipsiz kayıtlar dâhil) tek `.pdfworkspace` dosyasına kaydeder. **Yedeği geri yükle** manifesti ve PDF'lerin CRC32 bütünlüğünü denetler; açık onay alır ve tüm PDF/metadata kayıtlarını **tek IndexedDB transaction** ile geri yükler. Yedek dosyası uygulamaya özel, sıkıştırılmamış ve **şifrelenmemiştir**. Kaynak PDF'lerin hassas olabileceğini unutmayın. **Kayıtları denetle** kayıp PDF'leri, sahipsiz kayıtları ve bozuk sayfa referanslarını raporlar; otomatik silme yapmaz.
- PDF.js worker, görünür alan bazlı çizim, iptal edilebilir işler ve canvas bellek sınırı.

### Veri geçişi, güvenlik ve kurtarma notları

- Mevcut IndexedDB `pdfs` store korunur; sürüm 2 ile `workspace-metadata` store eklenir. Migrasyonda eski localStorage kopyası **okunabilir güvenlik kopyası** olarak bırakılır ama yeni kayıtların otoritesi IndexedDB'dir. Mevcut workspace'ler ve yer imleri silinmez.
- Workspace metadata kaydı her işlemde revizyon doğrular; bir sekme başka sekmenin son verisini sessizce ezemez. Çakışma algılandığında değişiklikler durdurulur ve sayfanın yenilenmesi gerekir.
- PDF/metadata yazımları ve tüm yedeğin geri yüklenmesi IndexedDB transaction'ı içinde yapılır. Depolama kotası, doğrulama veya transaction hatası halinde eski kayıtlar korunur.
- Yedekleme iki store'dan aynı read-only transaction'da tutarlı snapshot alır. `.pdfworkspace` formatı `PDFWSBK1` başlığı, JSON manifest ve sıkıştırılmamış Blob'ları içerir; PDF'ler CRC32 ile bozulmaya karşı doğrulanır. **CRC32 güvenlik imzası veya şifreleme değildir**; yalnızca bütünlük denetimidir.
- Geri yükleme, varsayılan olarak mevcut verilerle birleştirme yapmaz: tüm workspace'ler, yer imleri ve PDF'ler onaydan sonra yedekteki hâlleriyle **değiştirilir**. Önce mevcut kayıtlarınızı dışa aktarın.
- Tarayıcı profilinin silinmesi, cihaz arızası veya kaynak belgelerin kaybolmasına karşı en güvenli önlem, yedeği başka bir konumda tutmaktır.

### P1.1 — Yer imleri, okuma konumu ve kaynak PDF bağımlılıkları

- **Library → yer imine git**: PDF yerine başka PDF'lerden sayfalar içeren çalışma alanlarındaki yer imleri de doğru sanal belge kimliğiyle açılır. Yer imleri bu çalışma alanlarında sıralanabilir.
- **Son okunan sayfa**: Her workspace'in `lastPage` alanı IndexedDB workspace metadata'sında kaydedilir. Sayfa değişimi kısa gecikmeyle yazılır; workspace yeniden açıldığında son sayfaya dönülür. PDF içeriği değişirse konum 1'e sıfırlanır. Sayfa bağlantısı kaldırılırsa konum kalan sayfalara kaydırılır.
- **Kaynak bağımlılık uyarıları**: Başka çalışma alanlarında sayfaları kullanılan PDF değiştirilirken veya workspace silinirken etkilenecek workspace'ler ve sayfa sayıları açıkça gösterilir. Bağımlı sayfalar/yer imleri sessizce silinmez.
- **Eksik PDF sayfaları**: Kaynak PDF kaybolmuş, değiştirilmiş ya da ilgili sayfa bulunamıyorsa o sanal sayfa yerinde açıklamalı bir PDF uyarı sayfası görünür. Sağlam sayfalar kullanılabilir; sıra ve mevcut yer imi sayfa numaraları kaymaz.
- **Kayıtları denetle → Bozuk bağlantıları yönet**: Geçersiz sayfa referansları listelenir. Her bağlantı ayrı onayla kaldırılabilir. Kaynak PDF silinmez; kaldırılan derleme sayfasına ait yer imleri kaldırılır, sonraki sayfaların yer imi/okuma konumları düzeltilir. Kaynak geri gelmişse silme reddedilir.

### P1.2 — PDF içinde arama, içindekiler ve performans

- Üst çubuktaki **arama** simgesi veya `Ctrl/Cmd+F` ile belge metni taranır. Sonuçlar ilgili sayfa ve kısa bağlamla listelenir; önceki/sonraki veya sonuç kartına tıklayarak sayfaya gidilir. Taranan içerik cihazda kalır, dış hizmetlere gönderilmez.
- PDF.js'in orijinal `getOutline()` verisi küçük resim panelindeki **İçindekiler** sekmesinde gösterilir. Bölüm tıklaması PDF hedef sayfasına gider; gömülü outline yoksa açıklama gösterilir. Dış URL'ler güvenlik amacıyla otomatik açılmaz.
- PDF.js sayfa çizimi görünür alan tabanlı kalır. Ağır canvas/text katmanları için **12 sayfa**, küçük resim canvas'ları için **90 sayfa** üst sınırı uygulanır. Uzakta kalan sayfa tekrar görünür olursa yeniden çizilir. Ana belge sayfa kabuklarının tamamı hâlâ DOM'dadır; çok büyük belgelerde tam sanallaştırma ayrı bir iyileştirme konusudur.
- `npm test` birim/mantık testlerini, PR üzerindeki `browser-e2e` işi ise Chromium'da PDF açma, arama, PDF outline gezinme ve okuma konumunu koruma senaryolarını doğrular. Yerelde Playwright çalıştırmak için `npm install --no-save --package-lock=false @playwright/test@1.56.1`, `npx playwright install chromium` ve `npx playwright test` kullanılabilir.

### P1.3 — Sayfa sıralama, kaynak ilişkileri ve gerçek PDF dışa aktarma

- **Sayfa derlemesinde yeniden sıralama**: Sayfalar küçük resim panelindeki **Sayfalar** görünümünde sürükle-bırak ile taşınır; klavye veya dokunmatik ekranda taşıma tutamağı kullanılabilir. Sıra kalıcı olarak IndexedDB'de saklanır. Yer imleri, vurgular ve son okunan sayfa eski sayfa içeriğiyle birlikte yeni konuma taşınır. Kaynak PDF'lere dokunulmaz.
- **Kaynak ilişkileri**: Library'deki **Kaynak ilişkileri** penceresi hangi workspace'in hangi PDF sayfalarını kullandığını, kaynak dosya adlarını, geçerli ve bozuk referansları gösterir. İlgili hedef workspace açılabilir. Kaynakları değiştirme veya silme öncesinde mevcut bağımlılık uyarıları devam eder. Bozuk kaynaklar için ayrıca **Bozuk bağlantıları yönet** kullanılabilir.
- **PDF dışa aktar**: Sayfa workspace'inin üst çubuğunda **PDF dışa aktar** komutu seçilen sayfaları mevcut sıra ile **gerçek PDF** olarak birleştirir. `pdf-lib` ile orijinal PDF sayfa nesneleri kopyalandığından ekran görüntüsü/bitmap rasterization yapılmaz; kaynak sayfaların metin ve vektör içerikleri korunur. Kaynak workspace silinmiş, değişmiş veya belirtilen sayfa artık mevcut değilse işlem güvenli biçimde reddedilir. Kaynak PDF'ler ve çalışma alanı verileri değişmez. Çıktı yeni dosya olarak indirilir; yeni bir workspace oluşturulmaz. Kaynak PDF'lerin tüm üst düzey outline, form ve belge metadata özelliklerinin birebir taşınması garanti edilmez.
- **Testler**: Reorder→bookmark/highlight/okuma konumu eşleşmeleri, source cache, PDF sayfa boyutları/sırası, eksik kaynak ve iptal senaryoları birim testlerinde kontrol edilir.

### P2 Aşama 1–2: Regresyon ve stres altyapısı

İki tamamlayıcı P2 test grubu birlikte korunur:

- **Birim ve regresyon testleri (`npm test`)**: 20 workspace / 100 bağlantılı sayfa sınırları, sıralama, bookmark/vurgu, kaynak PDF değişimi, byte-doğru yedek/geri yükleme, PDF export ve PDF.js uyumluluk testleri. PR #32'nin yeni bütünleşik model regresyonları ve 1.900 bağlantılı sayfa stresi de eklenir.
- **Kapasite Chromium testleri**: `playwright.stress.config.mjs` ile 100/1.000/5.000 sayfalık PDF derin gezinme, canvas/DOM sınırları ve 20-workspace senaryosu. `P2_STRESS_PAGES=100` PR smoke; geniş profiller gece/manüel çalışır. GitHub Summary: `scripts/p2-stress-summary.mjs`.
- **Arama ve performans Chromium testleri**: `playwright.perf.config.mjs` ve `stress/viewer.perf.mjs` ile ilk sayfa, son sayfaya atlama, metin arama, heap ve canvas ölçülür. `P2_STRESS_PROFILE=smoke` yalnızca 100, `quick` 100/1.000, `full` 100/1.000/5.000 sayfa. JSONL/Markdown rapor: `stress/report.mjs`.
- **Deterministik PDF fixture'ları**: `tests/helpers/pdf-fixtures.mjs` ve `scripts/pdf-fixtures.mjs` farklı test senaryolarına hizmet eder; her ikisi de korunur.
- **CI politikası**: Normal PR'da standart E2E ile 100 sayfalık iki smoke grubu; 1.000/5.000 sayfa ve model stresleri gece 02:17 UTC veya manuel quick/full ile çalışır. Ölçülen süre/bellek değerleri SLA değildir.

Test matrisi ve tekrar üretme: [stress/README.md](stress/README.md). [P2.3 tam stres kabul raporu](docs/p2-3-acceptance.md). Yerel çalıştırma: `P2_STRESS_PAGES=100 npm run test:stress:capacity`, `P2_STRESS_PROFILE=smoke npm run test:stress:browser`, `npm run test:stress:model`.

### P2.4 — Büyük PDF optimizasyonu

- Dikey tam sayfa görünümünde 300 ve üzeri sayfalarda yalnızca yakın sayfa kabukları DOM'da oluşturulur; toplam kaydırma yüksekliği spacer'larla korunur.
- Tam metin aramada bounded eşzamanlı PDF.js okuma, sayfa sırasını koruyan sonuç birleştirme ve 24 MiB RAM-only belge metin önbelleği kullanılır. Kaynak dosya ve workspace kayıtlarına dokunulmaz.
- Yatay görünüm, yalnızca yer imleri modu ve küçük resimler henüz pencerelemeli değildir. Kabul matrisi: [P2.4 tasarım ve sınırlar](docs/p2-4-performance.md).

### P2.4-C — Küçük resim sanallaştırma

300 ve üzeri sayfada küçük resimler solda/altta, ana PDF sayfaları da dikey/yatay akışta yalnızca görünür pencereyi DOM'a oluşturur. 300+ yer imi için seçili sayfa sırası korunur. 5.000 sayfalık tam kabul testi başarılıdır; kalan karmaşık drag/drop ve yoğun yer-imi senaryoları için [kanıtlar ve kapsam](docs/p2-4c-thumbnails.md) belgesine bakın.

### P2.5 — Görüntü ağırlıklı PDF ve bellek dayanıklılığı

Taranmış (OCR'siz), karma görüntü+metin ve mobil Chromium senaryoları için tekrarlanabilir, büyük ve bağımsız RGB raster PDF'ler üretilir. Gerçek raster pikseli, son sayfa, metin arama, DOM/canvas sınırları ve gözlemsel JS heap ölçümleri doğrulanır. Normal PR'larda hafif profil, nightly CI'da 100+ MiB raster PDF koşusu kullanılır. **Tam P2.5 kabul testi 31.10.2026'da başarılı tamamlandı.** [P2.5 kapsamı, ölçüm protokolü ve sınırlamalar](docs/p2-5-raster-memory.md).

### P2.6 — Kota, gerçek PDF corpus'u ve fiziksel Android

Chromium'da gerçek IndexedDB kota override sonrası atomik rollback/reload, yerel izne tabi gerçek PDF corpus doğrulayıcıları ve ADB üzerinden fiziksel Android ölçüm protokolü: [P2.6 test planı ve kabul sınırları](docs/p2-6-field-reliability.md). Beş belgeli gerçek PDF corpus testi başarılıdır ([rapor](docs/p2-6-public-corpus-acceptance.md)). Fiziksel cihaz testleri yerel olarak çalıştırılır; PDF dosyaları depoya eklenmez.

### P2.7 — JPEG2000 / JBIG2 / CMYK

Gerçek `JPXDecode`/JPEG2000 kod akışı, dört kanallı `DeviceCMYK` raster ve kaynak/izin kontrollü `JBIG2Decode` örnekleriyle PDF.js görüntüleme doğruluğu; yalnız PDF'yi açmak değil, canvas üzerindeki renk ve siyah-beyaz pikselleri doğrulamak esastır. **P2.7 kabul: 5/5 codec doğrulaması başarılı** (JPEG2000, CMYK, 3 JBIG2 çeşidi). Normal PR'larda JPEG2000/CMYK otomatik, üç JBIG2 örneği manuel GitHub Actions işinde tekrar çalıştırılabilir. [P2.7 test protokolü ve sınırları](docs/p2-7-codec-acceptance.md).

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

Library'deki workspace kartları 20 adet sabit yuva gösterir. Geniş ekranda 10 + 10 yerleşimi uygulanır; PDF önizleme alanları A4 dikey sayfa en-boy oranını (210:297) kullanır. Dar ekranlarda sütun sayısı azaltılır. Boş bir workspace'e dokununca PDF/sayfa seçenekli başlangıç ekranı, oluşturulmamış bir yuvaya dokununca yeni workspace oluşturma akışı başlar. PDF küçük resimleri, kayıtlı belgelerden PDF.js aracılığıyla talep üzerine üretilir; aynı anda en fazla iki önizleme işlenir ve Library kapanınca bekleyen PDF.js işlemleri iptal edilir. Önizleme üretilemezse PDF kaydı korunur ve kartta bilgi mesajı gösterilir.

## Tarayıcı depolaması

PDF'ler (`pdf-viewer-workspace-files-v1` veritabanının `pdfs` object store'u) IndexedDB'de `workspaceId` anahtarıyla tutulur. Workspace metadata'sı `pdf-viewer-workspaces-v1` localStorage anahtarındadır. Library, dosya ID'sini **ve** adını mevcut workspace bilgileriyle eşleştirir. Silinmiş bir workspace'e ait veya mevcut workspace'in dosya adıyla uyuşmayan kayıtlar “sahipsiz” sayılır. Silme işleminde kayıt kimliği, ad, içerik boyutu ve son değiştirilme zamanı tekrar kontrol edilir.

Library'deki yerel PDF toplamı içerik byte'larını toplar; localStorage tahmini tüm origin'deki anahtar ve değerlerin UTF-16 boyutuna dayanır. Tarayıcının bildirdiği kota ve tahmini kullanım IndexedDB, Cache API ve aynı origin'deki **diğer** uygulamaların depolamasını da kapsayabilir; bu nedenle bu sayıların toplamı birbirine eşit olmak zorunda değildir. Örneğin `https://alorak.github.io/pdf/`, `https://alorak.github.io/` ile aynı origin'dedir.

IndexedDB için evrensel bir maksimum PDF dosya boyutu yoktur. Gerçek kota tarayıcıya, profile, işletim sistemine ve disk durumuna bağlıdır; yer dolduğunda `QuotaExceededError` oluşabilir. **Kalıcı depolama iste** tarayıcı desteklediğinde `navigator.storage.persist()` çağırır; kabul edilmesi, kullanıcının tarayıcı verilerini elle silmesine karşı garanti sağlamaz. İlgili genel bilgiler: [MDN Storage Quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

### Derleme veri modeli

Sayfa çalışma alanı, PDF dosyalarını fiziksel olarak birleştirmez veya yeni PDF üretmez. Workspace metadata'sında `mode: "pages"` ve `linkedPages` (kaynak workspace ID, PDF adı/boyutu/değiştirilme zamanı, sayfa numarası) saklanır. PDF.js kaynak PDF'leri okuyarak seçili sayfaları **tek bir sanal belge** olarak gösterir. Sayfalar eklenince sıralarının sonuna eklenir, aynı sayfa tekrarlanmaz. Workspace başına en fazla 100 bağlantılı sayfa desteklenir. Kaynak PDF silinirse/değişirse yanlış bir PDF gösterilmez; sayfa referansları kaybolmaz ve kaynak geri yüklenene kadar hata gösterilir. Sayfa kaldırılırsa kalan sayfaların yer imleri yeni sayfa konumuna kaydırılır. Daha önce PDF ve bağlantılı sayfaları birlikte kullanan workspace'ler, veri kaybını engellemek için aynı okuyucuda her iki tür sayfayı birlikte göstermeye devam eder.

### Modal davranışı

Tüm modallar karartılmış dış alana tıklandığında kapanır. Modal içeriğindeki boş alana tıklamak pencereyi kapatmaz. İşlem sürerken (ör. kalıcı PDF/sayfa silme veya derlemeye sayfa ekleme) dış tıklama ve Escape ile yanlışlıkla kapanma engellenir. Görsel PDF sayfası seçicisinde modal kapandığında devam eden PDF.js önizleme görevleri iptal edilir. Görsel seçici, dosyaları çoğaltmadan yalnızca referansları saklamaya devam eder.

### PDF değiştirme tutarlılığı

PDF seçme akışı dosyayı okumadan önce, eski PDF'yle gerçek byte içeriğini karşılaştırır (yalnızca dosya adı/boyutu/tarih karşılaştırması değildir). Aynı dosyanın yeniden seçilmesi bookmark'ları ve vurguları temizlemez. Farklı PDF seçildiğinde, yeni dosya önce PDF.js ile doğrulanır ve kullanıcıdan onay alınır. Sonra IndexedDB `put` isteği açık bir transaction içindeyken localStorage workspace metadata'sı güncellenir; localStorage yazımı başarısız olursa **IndexedDB transaction iptal edilir** ve önceki PDF korunur. Daha sonra IndexedDB transaction iptal edilirse localStorage metadata'sı geri alınmaya çalışılır. İki ayrı tarayıcı depolama API'si tek bir ACID transaction paylaşmadığından, ani tarayıcı kapanması veya eşzamanlı farklı sekme değişikliklerinde mutlak atomiklik garanti edilemez; kritik PDF'lerin harici kopyasını saklayın.

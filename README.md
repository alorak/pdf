# PDF — hızlı ve yerel PDF okuyucu

Tarayıcıda çalışan sade, hızlı ve gizliliğe odaklı bir PDF görüntüleyici. Belgeler bilgisayarından seçilir, sunucuya yüklenmez. Üretim paketi PDF.js'i ve worker dosyasını içerir; uygulama açıldıktan sonra CDN bağlantısı gerekmez.

## Özellikler

- **Open** butonuyla bilgisayardan PDF seçme; sürükle-bırak veya `Ctrl/⌘ + O` da desteklenir.
- **Dikey / yatay sınırsız sayfa akışı** arasında geçiş.
- **%20–%600 hassas zoom**: +/−, kaydırıcı, elle yüzde yazma ve `Ctrl/⌘ + fare tekerleği`.
- **Genişliğe sığdır**, **yüksekliğe sığdır** veya **sayfanın tamamını sığdır**; pencere değiştiğinde yeniden hesaplanır.
- Küçük resimler **solda veya altta**; Ayarlar'dan değiştirilebilir ya da gizlenebilir.
- Sayfa numarasıyla, önceki/sonraki butonlarıyla ve küçük resimlerle gezinti.
- Tercihler localStorage'da tutulur; PDF dosyası kaydedilmez.
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

## Klavye kısayolları

| Kısayol | İşlem |
| --- | --- |
| `Ctrl/⌘ + O` | PDF aç |
| `+` / `-` | Yakınlaştır / uzaklaştır |
| `0` | Sayfanın tamamını sığdır |
| `PageDown` / `PageUp` | Sonraki / önceki sayfa |
| `Home` / `End` | İlk / son sayfa |
| `Esc` | Ayarları kapat |

## Kapsam

İlk sürüm okuma performansına odaklanır; OCR, not ekleme, metin arama, metin seçimi ve PDF düzenleme içermez. Çok yüksek büyütmelerde tarayıcı belleğini korumak için çizim çözünürlüğü sınırlandırılır. Parolalı PDF'ler için parola girme ekranı henüz yoktur.

PDF işleme motoru: [Mozilla PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0).

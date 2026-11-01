# P2.6-B — Açık lisanslı gerçek PDF corpus kabul raporu

**Sonuç: 5/5 PDF.js ve 5/5 Chromium testi başarılı.** 1 Kasım 2026.

- Tam kabul: https://github.com/alorak/pdf/actions/runs/41312402109
- GovInfo hedefli doğrulama: https://github.com/alorak/pdf/actions/runs/41312235583
- İlk başarısız corpus testleri Vite geliştirme sunucusundaydı. Production build + preview ortamına geçince sorunlu GovInfo dahil beş belge geçti. Bu sonuç dev-server yeniden yüklenmesiyle tutarlı; kök nedenin münhasıran HMR olduğu kanıtlanmış değildir.

## Kaynak ve hash tablosu

| Belge | Kaynak | Bayt | SHA-256 | Sayfa |
|---|---|---:|---|---:|
| NACA 1947 | NASA NTRS, https://ntrs.nasa.gov/api/citations/19930081945/downloads/19930081945.pdf | 2927867 | db6f42598cd042130feb3d2867d35c019ad2e1448f1fd4885107bace207bb7ee | 22 |
| GovInfo 1941 | https://www.govinfo.gov/content/pkg/GOVPUB-GP-3cd63d7b6eacf6547906bba0ee832880/pdf/GOVPUB-GP-3cd63d7b6eacf6547906bba0ee832880.pdf | 8761439 | 87732f0521d47afd3334584fc9f310ac9bdd86ed440f5abc1c69132cee6e4ff5 | 197 |
| CC0 tarama | https://raw.githubusercontent.com/tinytoolkit-org/pdf-sample-files/master/out/sample-scanned.pdf | 432160 | d32a62e246778d856c85b03bfc6c91c36c9a071756b733f78daf46b4253de634 | 3 |
| CC0 metin | https://raw.githubusercontent.com/tinytoolkit-org/pdf-sample-files/master/out/sample-10-pages.pdf | 20337 | e8ce18676ce6c053532c6ace5a28fd9c0a79df22a8e19ae75026a249dcc2db6d | 10 |
| CC0 form | https://raw.githubusercontent.com/tinytoolkit-org/pdf-sample-files/master/out/sample-form-filled.pdf | 12038 | 17a5947607077aa0581cfc6c7f3158779b36b2c4c92e18cdeb9793bdbb2912fc | 1 |

NASA NACA ve GovInfo için hak dayanağı ABD devlet işi / 17 USC 105; tinytoolkit proje beyanı CC0-1.0. Hakların yeniden kullanım için ayrıca kontrol edilmesi gerekir.

## Test edilen davranış

- 5/5 sabit SHA-256, sayfa sayısı, PDF.js metin ve image operator yapısal kontrolü geçti.
- 5/5 production Chromium render ve ilk/orta/son sayfa gezinme geçti; tarayıcı uygulama hatası 0.
- GovInfo'da 1/99/197, NACA'da 1/11/22, metin örneğinde 1/5/10 sayfa render edildi.
- Ekranda en fazla 5 PDF canvas ve 8 thumbnail canvas gözlendi.
- Node PDF.js yapısal testinde openjpeg.wasm ve jbig2.wasm dosya-URL yükleme uyarıları mevcuttu. Browser testleri bu belgeler için production same-origin decoder asset'leriyle başarılıdır; Node warning bütünüyle çözüldü iddiası yok.

## Yeniden çalıştırma

1. NPM bağımlılıkları ve Playwright Chromium kurulur.
2. npm run build ve node scripts/check-pages.mjs çalıştırılır.
3. Hak/onay bilgili yerel corpus manifesti ile P2_REAL_CORPUS_MANIFEST=/path/to/manifest.json npm run test:corpus çalıştırılır.
4. Aynı manifestle P2_REAL_CORPUS_MANIFEST=/path/to/manifest.json npm run test:corpus:browser çalıştırılır.
5. playwright.corpus.config.mjs production preview kullanır; build yapılmadan çalıştırılmamalıdır.

## Açık sınırlar

Bu beş dosya, tüm JPEG2000/JPX, JBIG2, CCITT, CMYK, şifreli/imzalı PDF veya gerçek Android düşük RAM davranışını temsil etmez. Full image correctness / PDF-A sertifikasyonu yapılmadı. Test PDF baytları depoya veya artifact'a yazılmadı. PR sonunda tek seferlik ağır workflow kaldırılmıştır.

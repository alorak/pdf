# P2 aşama 1–2: Regresyon ve stres testleri

## Kapsam / test matrisi

| Paket | Çalışma | Kabul kriteri | Tetikleme |
|---|---|---|---|
| P2-R1 | Linked sayfa yeniden sıralama → bookmark ve highlight → yedek → geri yükle → gerçek PDF export | Kaynak sayfa ve notlar kaymadan, export'ta doğru sırayla kalır | Her PR, `npm test` |
| P2-R2 | PDF kaynak değiştirme/silme, bağımlılıklar | Eski sayfalara yanlış dosya bağlanmaz; kaynak bağlantıları sessizce silinmez | Her PR |
| P2-R3 | Aynı içerikli PDF yeniden açma | Ad/tarih farklı olsa da gerçek bayt eşitliği korunur | Her PR |
| P2-R4 | 20 workspace, 100 sayfa/workspace limitleri | 21. workspace ve 101. bağlantı reddedilir; reload'da limit korunur | Her PR |
| P2-R5 | IndexedDB atomic commit, revizyon çakışması, migration ve yedekleme | Mevcut P0 testleri bozulmaz | Her PR |
| P2-S1 | 20 workspace, 19×100=1900 bağlantılı sayfa, sıralama, bookmark, yedek ve 100 sayfalık gerçek PDF export | Kayıt kaybı yok, tüm referanslar geçerli, çıktı 100 sayfa | Nightly / manuel |
| P2-S2 | Deterministik 100, 1.000 ve 5.000 sayfalık PDF.js belgesi | Tam sayfa sayısı, 1./orta/son sayfa metinleri, sabit SHA-256 | Nightly / manuel |
| P2-S3 | Gerçek Chromium açılış, son sayfaya atlama, tüm belgede arama | Yakalanmamış JS hatası yok, doğru sonuç, <=30 sayfa canvas ve <=110 thumb canvas | PR: 100 sayfa; Nightly: 100/1000/5000 |

PDF fixture'ları fiziksel depoda tutulmaz: `scripts/pdf-fixtures.mjs` sayfaların içeriklerini ve xref ofsetlerini deterministik olarak üretir. Her baseline kaydında SHA-256, Chrome sürümü, Node sürümü ve commit bulunur. 5.000 sayfalık fixture düşük çözünürlüklü **metin belgesidir**; 500 MB resim ağırlıklı PDF stress testinin yerini tutmaz.

## Komutlar

```bash
npm ci
npm test
node scripts/generate-stress-pdf.mjs 1000 test-results/stress/fixture-1000.pdf
P2_STRESS_PROFILE=quick npm run test:stress:model
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
P2_STRESS_PROFILE=quick npm run test:stress:browser
npm run test:stress:report
```

`P2_STRESS_PROFILE=smoke` sadece 100 sayfalık tarayıcı testi; `quick` 100+1000, `full` (varsayılan) 100+1000+5000 sayfa kullanır.

## CI çalışma düzeni

- `validate.yml`: Her PR'da birim+entegrasyon, üretim derlemesi, standart Chromium E2E ve **100 sayfalık hafif baseline**.
- `p2-stress.yml`: Her gece **02:17 UTC** (Türkiye 05:17) ve `workflow_dispatch` ile manuel `quick`/`full` profile. Model+Chromium benchmark, Markdown baseline ve JSONL sonuçlar, 30 gün artifact.
- Normal PR'larda 1.000/5.000 sayfalık ağır Chromium testleri koşturulmaz. CI gecikmesi bu sayede sınırlandırılır.

## Baseline ve regresyon politikası

`test-results/stress/baseline.md` satırları ilk açılış süresi, son sayfaya atlama, PDF içinde metin arama, JS heap (varsa), canvas sayıları ve Node RSS'yi kaydeder. **Mutlak ms / MiB SLA'sı ilk çalıştırmada konmaz**; CI donanımı ve Chrome sürümü değişebilir. Aynı runner/browser profilinde 3–5 başarılı tekrar sonrasında varyans aralığı çıkartılarak anlamlı gecikme/bellek regresyon eşikleri belirlenebilir.

Fonksiyonel kapılar ilk günden zorunludur: doğru sayfa/metin, veri bütünlüğü, başarısız kaynak işlemlerinde fail-closed, canvas üst sınırı ve browser exception bulunmaması. Stress testi hata verirse artifact ve CI logları saklanır. GitHub Pages prod release öncesinde en son başarı durumu ayrıca kontrol edilmelidir.

## Bilinen sınırlar

- 20 workspace içinde birinin kaynak olduğu durumda en fazla 19 tüketici × 100 = **1900 bağlantılı sayfa** oluşturulabilir. 20×100=2000 bağlantı aynı anda beklenemez; kaynak için ayrı workspace gereklidir.
- P2.4-C sonrasında 300+ sayfada ana sayfa ve thumbnail DOM pencereleme aktiftir; 5.000 sayfalık belge her sayfayı DOM'da tutmaz. Görüntü ağırlıklı PDF iş yükleri P2.5'te ayrıca doğrulanır.
- IndexedDB kota/yazım abort testleri halen mevcut fake-IDB birim testleriyle doğrulanır; fiziksel tarayıcı diski tükenmesi nightly CI üzerinde uygulanmaz.
- `performance.memory` yalnızca Chromium'da desteklendiği için heap alanı diğer tarayıcılarda `n/a` olabilir.

## P2.3 kabulü

31 Ekim 2026'da iki Playwright test grubu birlikte tam profilde geçti. Artifact bütünlüğü `node scripts/verify-p2-3.mjs` ile zorunlu doğrulanır; farklı test grupları kendi `outputDir` alanlarını temizler, `test-results/stress/` ölçümleri korunur. Kabul raporu: [docs/p2-3-acceptance.md](../docs/p2-3-acceptance.md).

## P2.5 — Raster/mobil PDF dayanıklılığı

`P2_IMAGE_PROFILE=smoke|quick|full`, `e2e/p2-5-raster.stress.spec.mjs` ile taranmış PDF (OCR yok), karma raster+vektör+metin ve mobil viewport koşularını seçer. Fixture'lar `scripts/p2-5-image-fixtures.mjs` tarafından üretilir; binary PDF'ler commit/artifact'a eklenmez. Nightly `p2-stress.yml` quick/full çalıştırır; `node scripts/verify-p2-5.mjs` raporların eksiksizliğini ve raster/sayfa/bellek ölçümlerini doğrular. Detay: [P2.5 kabul dokümanı](../docs/p2-5-raster-memory.md).

# P2.3 — Tam stres testi kabul raporu

**Durum: KABUL EDİLDİ (31 Ekim 2026)**

- Kabul PR'ı: [#33](https://github.com/alorak/pdf/pull/33)
- Doğrulanan PR commit'i: `7be80048433f0029ae692b69cdabe60b435a9fb4`
- GitHub Actions [full kabul koşusu #41209634699](https://github.com/alorak/pdf/actions/runs/41209634699): **başarılı**
- Standart `validate` ve `browser-e2e` kontrolleri de başarılı.
- Tam kabul artifact'ı: `p2-3-full-acceptance-41209634699` (GitHub Actions çalışma sayfasında, 30 gün).
- Ortam: GitHub-hosted Linux x64, Node `v24.22.1`, Chromium `141.0.7390.37`, 4 vCPU, 1365×900 viewport.

## Kapsam ve kanıt

| Kabul alanı | Sonuç | Kanıt |
|---|---|---|
| P0/P1 regresyon, build ve Pages asset doğrulaması | Geçti | GitHub Actions adımları |
| 20 workspace / 1900 bağlantı, sıralama, bookmark, backup/restore ve 100-sayfa export | Geçti | `model.log` |
| Gerçek PDF.js ile deterministik 100/1000/5000 sayfa ve SHA-256 doğrulaması | Geçti | `model.log` |
| Chromium derin gezinme, kapasite/canvas testleri (100/1000/5000) | Geçti | `pages-{100,1000,5000}.json` |
| 20-workspace Chromium arayüz testi | Geçti | `workspace-20-links-100.json` |
| Son sayfanın **gerçek canvas render'ı**, tam metin arama ve ölçüm kaydı | Geçti | `baseline.jsonl` |
| Artifact'ın eksiksizliği, SHA uyumu, raporlarda model/kapasite verisi | Geçti | `scripts/verify-p2-3.mjs` çıktısı: `P2_3_ACCEPTANCE_PASSED` |

## Tek-koşu performans baseline'ı

| Sayfa sayısı | İlk gerçek sayfa render'ı (ms) | Son sayfanın gerçek render'ı (ms) | Tam metin arama (ms) | Arama sonrası JS heap (MiB) |
|---:|---:|---:|---:|---:|
| 100 | 936.3 | 895.5 | 386.9 | 13.0 |
| 1.000 | 1.023,0 | 945,0 | 932,2 | 14,1 |
| 5.000 | 1.641,2 | 1.396,0 | 13.358,0 | 29,6 |

Ayrı kapasite testinde 100/1.000/5.000 sayfalarda ilk görüntüleme sırasıyla 1.019/1.072/1.456 ms, DOM düğümü sayısı 2.258/14.021/65.997 idi. Model testinde 1900 bağlantının yedek/geri yükleme ve export işlemleri `324,3 ms` sürdü (tek ölçüm).

## P2.3 sırasında saptanan ve giderilen sorunlar

1. İki Playwright konfigürasyonu aynı varsayılan `test-results` çıktı alanını temizliyordu. İlk koşu testleri geçmesine rağmen kapasite JSON'ları ve `model.log` artifact'tan silinmişti. `outputDir` yolları `test-results/playwright-capacity` ve `test-results/playwright-perf` olarak ayrıldı.
2. Son sayfaya geçiş metriği, sayfa numarası değişimini ölçüp **gerçek canvas'ı beklemiyordu**; ilk koşuda 5000 sayfa örneği sıfır canvas ile raporlanmıştı. Son sayfa canvas'ı bekleme ve `lastPageCanvasRendered` kanıtı eklendi.
3. `scripts/verify-p2-3.mjs` tüm model/kapasite/arama çıktılarını, fixture hash'lerini, sayfa sayısını ve rapor bütünlüğünü doğrulayan bir CI kabul kapısı olarak eklendi.
4. Düzeltilmiş koşunun artifact'ı **8 dosya** içerir: `model.log`, üç `pages-*.json`, workspace JSON, `baseline.jsonl`, `baseline.md`, `p2-summary.md`.

## Değerlendirme ve kalan sınırlar

- **P2.3 fonksiyonel ve kanıt bütünlüğü kabulü geçmiştir.** Verilen süre/bellek sonuçları SLA veya regresyon eşiği olarak henüz kullanılamaz; aynı koşullarda 3–5 tekrar ile istatistiksel değişkenlik ölçülmelidir.
- 5.000 sayfada yaklaşık 66 bin DOM düğümü ve 13,36 saniyelik tam metin arama ölçümü P2.4 için önemli optimizasyon adaylarıdır. DOM virtual scrolling ve arama indeksleme ayrı profillerde değerlendirilmelidir.
- Fixture 5.000 sayfa için yaklaşık 1,74 MB ve metin ağırlıklıdır; 100–500 MB taranmış/resim ağırlıklı PDF davranışını kanıtlamaz. Bu iş P2.5 kapsamındadır.
- CI sürelerini gereksiz artırmamak için P2.3'ü tetikleyen geçici workflow kalıcı PR'dan çıkarılır; mevcut gecelik `p2-stress.yml` tam profil ve artifact bütünlüğü doğrulamasıyla devam eder.

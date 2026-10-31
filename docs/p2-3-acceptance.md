# P2.3 — Birleşik tam stres testi ve kabul kaydı

## Amaç
PR #32 ile birleşmiş iki P2 test altyapısını **aynı main commit'inde** ve gerçek GitHub Actions Chromium koşullarında doğrulamak. Bu PR'ın amacı uygulama davranışını değiştirmek değil, doğrulanabilir performans/kabul kanıtı üretmektir.

## Çalışma profili
- `P2_STRESS_PROFILE=full` (100 / 1000 / 5000 sayfa; PDF.js model ve Chromium arama/gezinti)
- `P2_STRESS_PAGES=100,1000,5000` (Chromium kapasite, çoklu derin gezinme)
- 20 workspace ve 19 × 100 = 1900 bağlantılı sayfa; bookmark, sıralama, backup/restore ve gerçek PDF dışa aktarımı
- Normal `npm test`, `npm run build`, `node scripts/check-pages.mjs`
- Pinned `@playwright/test@1.56.1` ve Node.js 24

## Kabul kriterleri
| Alan | Kriter | Kanıt |
|---|---|---|
| Regresyon | Unit/integration testlerin tamamı geçer | GitHub Actions job |
| Model | 1900 referans, round-trip yedek, 100-sayfa export; PDF.js 100/1000/5000 parse ve metin kontrolü geçer | `test-results/stress/model.log` |
| Kapasite/UI | Hedef sayfaya navigasyon, sayfa sayıları ve istisnasız çalışma | `pages-*.json`, `workspace-*.json` |
| Render sınırları | Kapasite testi en fazla 16 page canvas / 100 thumbnail canvas; arama testi en fazla 30 / 110 | İki test grubunun kendi assertions |
| Arama | Son sayfa ve tam metin araması doğru sonuç verir | `baseline.jsonl` |
| Build | Production build ve GitHub Pages asset kontrolü başarılı | GitHub Actions job |
| İzlenebilirlik | Commit, tarayıcı, Node, fixture SHA-256, ölçüm raporları artifact'a dahil | `baseline.jsonl`, `baseline.md`, `p2-summary.md` |

## Ölçüm disiplini
Bu ilk birleşik **tam kabul koşusudur**. Bir başarı raporu tek başına karşılaştırmalı performans bütçesi oluşturmaz. Süre, JS heap ve DOM metrikleri yalnızca baseline'dır. Benzer runner/browser koşullarında 3–5 tekrardan sonra ortanca, p95 ve değişkenlik ölçülerek P2.4 sanallaştırma öncesi referans belirlenmelidir. Metin ağırlıklı deterministik fixture, görüntü ağırlıklı 500 MB PDF yerine geçmez.

## Yürütme
`.github/workflows/p2-3-acceptance.yml` yalnızca bu kabul PR'ında değiştiğinde ve `test/p2-3-full-acceptance` dalında çalışır; mevcut günlük/gecelik akışı veya diğer PR'ların CI maliyetini artırmaz.

**Durum:** Kabul sonucu henüz kaydedilmedi. CI job ve artifact sonuçları incelenmeden P2.3 tamamlandı olarak işaretlenmez.

## Temizlik
Sonuçlar değerlendirildikten sonra tek-seferlik workflow dosyası kaldırılıp kalıcı kabul özeti ayrı bir commit'e taşınabilir. `main` dalında gereksiz tetikleyici tutulmamalıdır.

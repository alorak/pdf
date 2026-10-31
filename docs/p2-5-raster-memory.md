# P2.5 — Görüntü ağırlıklı PDF dayanıklılığı ve bellek baseline'ı

## Problem
P2.4-C'nin 5.000 sayfalık yükü yaklaşık 1,74 MiB metin ağırlıklı bir PDF idi. 5.000 sayfa sanallaştırması ve metin arama testi, 100+ MiB taranmış PDF veya büyük embedded-image decoding için geçerli ölçüm sağlamaz.

## Kapsam
1. **Taranmış belge vekili:** Metin katmanı/hidden OCR içermeyen, her sayfada bağımsız lossless /FlateDecode RGB XObject bulunan PDF. PDF.js `getTextContent` boş, canvas gerçekten boyanır, aramada sıfır sonuç.
2. **Karma belge vekili:** Her sayfada görüntü, vektör çizgisi ve benzersiz aranabilir metin; son sayfa araması.
3. **Mobil Chromium:** 390×844 viewport, DPR 2 ve dokunma desteği ile taranmış PDF. Bu test **gerçek düşük RAM sınırı uygulamaz**; sadece mobil viewport ve touch davranışını ölçer.
4. **Tekrarlı gezinme:** ilk/orta/son/ilk sayfa için boyanmış raster piksel kanıtı, browser JS hata/sayfa render hatası, canvas üst sınırları, JS heap, Chromium alt süreçlerinin gözlemsel PSS/RSS toplamı ve DOM node örnekleri.
5. **Kanıt:** Her profil için bytes, SHA-256, PDF sayfası, görüntü boyutu, Chromium/Node/commit, load süresi, her gezinmede heap/DOM/canvas. PDF dosyaları repoya ve CI artifact'ına eklenmez.

## Test profilleri
| Profil | Tarama | Karma | Mobil tarama | Çalıştırma |
|---|---|---|---|---|
| smoke | 5×128 px | 6×128 px | 4×128 px | Her PR |
| quick | 24×256 px | 24×256 px | 12×256 px | Gecelik manuel quick |
| full | 128×512 px (~96 MiB) | 96×512 px (~72 MiB) | 32×512 px (~24 MiB) | Gecelik full ve tek seferlik kabul |

Bunlar yüksek entropili, **sentetik raster** PDF'lerdir; gerçek tarayıcı çıktısı, JPEG2000, JBIG2, CMYK, sayfa dönüşleri veya şifreli/imzalı PDF çeşitliliği yerine geçmez. Gerçek belge corpus'u ayrıca lisans ve mahremiyet doğrulaması gerektirir.

## Kabul kriterleri
- `npm test`: ikili xref/stream doğruluğu, aynı seed için hash, RGB image XObject operatörü, scan için metinsizlik, mixed için doğru metin.
- Chromium: 3 profilin hepsinde PDF sayfa sayısı, gerçek raster piksel render, ilk/orta/son/ilk sayfa gezinme ve metin aramasında doğru sonuç.
- DOM/canvas sınırları: en fazla 16 page canvas, 100 thumbnail canvas.
- Her raporda SHA-256, bytes, bellek ve DOM örnekleri. `node scripts/verify-p2-5.mjs` eksik/yanlış/tekrarlı raporu reddeder.
- Yükleme süresinin ölçümü büyük test PDF'si geçici diske yazıldıktan, fakat Playwright'ın dosya yüklemesi başlamadan hemen önce başlar. Chromium süreç PSS ölçümü mümkünse CDP PID + Linux /proc/smaps_rollup ile kaydedilir; toplam RSS paylaşılan sayfaları birden fazla sayar, bu nedenle karşılaştırma için PSS tercih edilir. Perf süreleri veya JS heap için **ilk koşuda keyfî SLA konmaz**. 3–5 tekrar sonrası p50/p95 kıyaslama; mobil test için gerçek RAM limiti yok.
- Normal PR'da yalnız smoke. `.github/workflows/p2-stress.yml` quick/full için gerçek raster fixture'ları üretir.

## Sınırlar ve takip
- Chromium mobil emülasyonu gerçek Android donanımının bellek baskısını ve işletim sistemi tarafından sekme sonlandırmayı taklit etmez.
- 256 px/512 px raster'lar çıktı boyutu açısından ağırdır, fakat yüksek çözünürlüklü gerçek tarama davranışını birebir temsil etmez.
- IndexedDB kota hatası ve oturum yenilemede PDF'nin tekrar açılması ayrı, kontrollü end-to-end testlerle genişletilebilir.
- Kabul CI sonuçları aşağıda kaydedilmiştir. Daha geniş gerçek tarama corpus'u ve fiziksel mobil RAM limiti ayrıca doğrulanmalıdır.

## Tam kabul kaydı — 31 Ekim 2026

**Durum: GEÇTİ — sentetik raster/karma/mobil test kapsamı.**

- [Başarılı tam CI #41222315643](https://github.com/alorak/pdf/actions/runs/41222315643)
- Doğrulanan commit: `e89b35f39a3f00467c3654ea7b3698c8291e7281`
- Artifact: `p2-5-raster-acceptance-41222315643` (JSON metrikleri, PDF kaynakları hariç; 30 gün saklama).
- Tarayıcı: Chromium, GitHub-hosted Linux; Node.js 24; mobil senaryoda 390×844, DPR 2, touch.
- Hem `P2_5_ACCEPTANCE_PASSED` hem de `P2_3_ACCEPTANCE_PASSED` kanıt kapıları başarılı. Normal PR smoke, tüm birim testleri ve 100/1.000/5.000 sayfalı regresyonlar da başarılı.

| İş yükü | PDF (byte) | Sayfa | İlk boyanmış raster (ms) | Chromium PSS (MiB) | Toplam Chromium RSS (MiB) | Ana JS heap (MiB) | DOM |
|---|---:|---:|---:|---:|---:|---:|---:|
| Scan desktop | 100.757.000 | 128 | 969,1 | 548,5 | 767,5 | 7,0 | 2.632 |
| Mixed desktop | 75.577.766 | 96 | 973,4 | 533,6 | 766,4 | 7,3 | 2.293 |
| Scan mobile viewport | 25.189.350 | 32 | 944,8 | 358,7 | 592,7 | 6,3 | 1.383 |

- Her PDF'ye özgü SHA-256 manifestte ve artifact'ta bulunur; fixture her sayfada ayrı RGB raster XObject taşır. `getTextContent` tarama senaryosunda boştur; karma senaryoda her sayfanın benzersiz metni vardır.
- Canvas üzerinde beyaz olmayan boyanmış pikseller ilk, orta ve son sayfada doğrulandı. 16 sayfa canvas/100 thumbnail canvas sınırları ve yakalanmamış browser hatası yok koşulu korundu.
- Chromium PSS, CDP `SystemInfo.getProcessInfo` ile tanımlanabilen süreçler için Linux `/proc/<pid>/smaps_rollup` üzerinden ölçülür. PDF'ye özel fark belleği **değildir**; Chromium taban/worker/native allocations da içerir. RSS toplamı paylaşılan sayfaları tekrarlı sayabilir, PSS tercih edilir.
- Ölçülen açılış süresi test dosyasının diske yazılmasını **içermez**; dosya yükleme, açma, kaydetme ve görünür rasterın boyanmasını içerir. Birer koşuluk gözlem olduğundan performans SLA'sı veya p95 verilmez.
- Playwright'ın 50 MiB üzeri `setFiles({buffer})` sınırı ilk full koşuda tespit edildi. Dosyalar geçici diske yazılıp path ile yüklenerek düzeltildi; geçici dosya sonunda silinir, 100 MiB PDF artifact'a girmez.

### Önerilen P2.6 / saha doğrulaması

Gerçek 300–600 DPI JPEG/JPX/JBIG2/CCITT/CMYK çok sayfalı corpus; mobil Android üzerinde düşük RAM/sekme öldürülmesi; IndexedDB kota ve tekrar açma; aynı runner'da 3–5 tekrar ile PSS değişkenliği ve p50/p95; gerekirse PDF.js worker bellek salımı ve büyük dosyalarda storage/disk etkileşimi incelenmelidir.


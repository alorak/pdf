# P2.5 — Görüntü ağırlıklı PDF dayanıklılığı ve bellek baseline'ı

## Problem
P2.4-C'nin 5.000 sayfalık yükü yaklaşık 1,74 MiB metin ağırlıklı bir PDF idi. 5.000 sayfa sanallaştırması ve metin arama testi, 100+ MiB taranmış PDF veya büyük embedded-image decoding için geçerli ölçüm sağlamaz.

## Kapsam
1. **Taranmış belge vekili:** Metin katmanı/hidden OCR içermeyen, her sayfada bağımsız lossless /FlateDecode RGB XObject bulunan PDF. PDF.js `getTextContent` boş, canvas gerçekten boyanır, aramada sıfır sonuç.
2. **Karma belge vekili:** Her sayfada görüntü, vektör çizgisi ve benzersiz aranabilir metin; son sayfa araması.
3. **Mobil Chromium:** 390×844 viewport, DPR 2 ve dokunma desteği ile taranmış PDF. Bu test **gerçek düşük RAM sınırı uygulamaz**; sadece mobil viewport ve touch davranışını ölçer.
4. **Tekrarlı gezinme:** ilk/orta/son/ilk sayfa için boyanmış raster piksel kanıtı, browser JS hata/sayfa render hatası, canvas üst sınırları, JS heap ve DOM node örnekleri.
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
- Perf süreleri veya JS heap için **ilk koşuda keyfî SLA konmaz**. 3–5 tekrar sonrası p50/p95 kıyaslama; mobil test için gerçek RAM limiti yok.
- Normal PR'da yalnız smoke. `.github/workflows/p2-stress.yml` quick/full için gerçek raster fixture'ları üretir.

## Sınırlar ve takip
- Chromium mobil emülasyonu gerçek Android donanımının bellek baskısını ve işletim sistemi tarafından sekme sonlandırmayı taklit etmez.
- 256 px/512 px raster'lar çıktı boyutu açısından ağırdır, fakat yüksek çözünürlüklü gerçek tarama davranışını birebir temsil etmez.
- IndexedDB kota hatası ve oturum yenilemede PDF'nin tekrar açılması ayrı, kontrollü end-to-end testlerle genişletilebilir.
- Kabul CI sonuçları gözlenmeden P2.5 bitmiş olarak işaretlenmez.

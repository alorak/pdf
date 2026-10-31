# P2.4-C — Thumbnail DOM sanallaştırma

## Problem

P2.4-A/B sonunda 5.000 sayfalık PDF ana görüntüleyicisinde 3 sayfa kabuğu tutuluyordu ancak tüm küçük resim DOM'u oluşturuluyordu. 31.10.2026 doğrulanmış önceki baseline: 56.032 DOM düğümü, ilk sayfa 1.063 ms, arama 2.122 ms (farklı CI koşuları doğrudan SLA sayılmaz).

## Uygulama

- 300 ve üzeri thumbnail kaydında soldaki dikey veya alttaki yatay liste **viewport + overscan** şeklinde sanallaştırılır; ekran dışındaki thumbnail düğümleri ve canvas'ları serbest bırakılır.
- Gerçek kaydırma uzunluğu, `thumb-entry` eleman boyutları ve flex gap'i hesaba katan önce/sonra spacer'larla korunur.
- `src/thumbnail-window.js` pencere aralıklarının doğruluğunu bağımsız test eder.
- Yer imleri modunda liste az sayıda kayıt içeriyorsa yalnızca seçili yer imleri oluşturulur; 300+ kayıtlı yer imi için aynı pencereleme uygulanır.
- Bookmark sayfa atlama, fiziksel sayfa numarası, sidebar altta/solda, dokunmatik ve drag/drop olayları mevcut mantıksal sayfa kimliğini kullanır.
- Sayfa birleştirme ve sıralama işlemlerinde yalnızca görünür düğümler için olay dinleyicileri oluşturulur; diğer sayfaların metadata kayıtları değişmez.
- 5.000 sayfa gece koşusunda `thumbnailEntries <= 80` kabul kapısı ve eksiksiz kanıt kontrolü uygulanır.

## Sınırlar

- P2.4-C, **yatay ve dikey ana PDF akışı** için mantıksal sayfa ofsetleri ve pencereleme uygular. Yatay modun tam sayfa sayısı, kaydırma genişliği ve son sayfa gerçek canvas kabulü test edilir.
- Yalnızca yer imleri görünümünde 300 veya üzeri kayıt varsa ana sayfalar da seçili yer imi sırasına göre sanallaştırılır. 300 altı için sayfalar doğrudan oluşturulur.
- Gerçek cihazda 100 MB+ görüntü ağırlıklı PDF dosyaları P2.5 kapsamındadır.

## Kabul kaydı — 31 Ekim 2026

**Tam test:** [P2.4-C full acceptance #41220266903](https://github.com/alorak/pdf/actions/runs/41220266903) — **SUCCESS**, `P2_3_ACCEPTANCE_PASSED` kanıt bütünlüğü doğrulandı.

- Commit: `6e10b970bd9cbf5134990ec566f960d8d2737a0f`
- Ortam: Node v24.22.1, Chromium 141.0.7390.37, GitHub-hosted Linux CI, 1365×900.
- Kanıt: `p2-4c-full-evidence-41220266903` artifact'ı (30 gün). Birim testleri, 1.900 bağlantılı sayfa, 100/1000/5000 sayfalı PDF.js, Chromium kapasite, yatay PDF ve thumbnail, metin arama ile SHA-256 doğrulamaları geçti.

### 5.000 sayfa — ilk tam kabul karşılaştırması

| Metrik | P2.4-B | P2.4-C |
|---|---:|---:|
| DOM node sayısı (kapasite testi) | 56.032 | **1.620** |
| Main page shells | 3 | **3** |
| Thumbnail entry (bağlı) | ~5.000 | **7** |
| İlk gerçek sayfa (ms, Chromium browser profili) | 1.063,2 | **588,0** |
| Son sayfa gerçek canvas (ms) | 140,7 | **59,6** |
| Tam metin arama (ms) | 2.121,5 | **1.898,3** |
| Arama sonrası heap (MiB) | 38,4 | 30,9 |

Bunlar farklı runner koşularının **birer gözlemsel ölçümüdür**, p95 veya SLA değildir. Performans değişkenliğini belirlemek için 3–5 tekrarlı çalıştırma gerekir. RAM değerleri proses anına göre farklılaşabilir.

### Kalan sınırlar

- 300+ gerçek yer imi içeren bir PDF'de **bookmark-only ana sayfa görünümü** için mantıksal sıralı pencereleme kodu mevcut; ancak büyük kayıtlı yer imi yükünün otomatik Chromium E2E'si ayrıca yazılmalıdır. Küçük yer-imi ve boş durum senaryoları test edildi.
- Uzun mesafeli drag-and-drop, otomatik scroll ve touch pointer-capture davranışının çok büyük bağlı sayfa derlemesinde ayrı uçtan uca doğrulanması yararlı olur.
- Görüntü ağırlıklı büyük PDF fixture ve düşük bellekli mobil cihazlar P2.5 kapsamındadır.


# P2.10 — Fiziksel Android'de 25–100 MB taranmış PDF soak testi

## Durum ve ölçüm iddiaları

**Fiziksel cihaz doğrulaması: BEKLİYOR.** Bu PR yalnız ölçüm koşucusu, bağımsız PDF preflight, sayı analizi ve simüle verilerle birim testlerini içerir. Herhangi bir Android modelinde ölçülen PSS, OOM/LMK veya geri yükleme sonucu **henüz yoktur**. Test, kullanıcının bilgisayarında yetkilendirilmiş gerçek Android ve Chrome ile çalıştırıldığında yeni bir JSON kanıtı üretebilir.

Bu testin üç ayrı kanıt katmanı vardır:

- **PDF kaynağı:** yerel PDF 25–100 **MB** (ondalık) aralığında olmalı; PDF.js ile 1./orta/son sayfalardaki raster image XObject'ler doğrulanır, yerel SHA-256 hesaplanır. OCR katmanı olabilir. PDF'nin gerçekten fiziksel tarayıcıdan geldiği yalnız bu kontrolle kanıtlanmaz.
- **Cihazda aynı dosya:** aynı PDF Android'in Download dizinine kullanıcı tarafından USB/ADB ile kopyalanır. Cihazdaki `sha256sum` yerel SHA-256 ile eşleştirilir. Web uygulamasında o dosya kullanıcının kendisi tarafından seçilir; CDP dosya yükleme yapmaz. Çalışan sekmenin dosya adı/içeriği uzaktan kriptografik olarak doğrulanmadığından kullanıcı doğru dosyayı seçmelidir.
- **Fiziksel saha ölçümü:** emülatör/eksik cihaz kimliği reddedilir. Android Chrome PDF görüntüleyicisi açıkken 5–30 saniyelik aralıklarla `dumpsys meminfo com.android.chrome`, `/proc/meminfo`, izin varsa `/proc/pressure/memory` örneklenir. Chrome DevTools Protocol bağlıysa ilk/orta/son ve aradaki sayfalarda gerçek canvas çizimiyle gezinme gecikmesi ölçülür. Bu CDP yolu Android Chrome sürümüne/USB hata ayıklamaya bağlıdır; bağlantı sağlanmazsa yanlış başarı raporu oluşturulmaz.

Kaynaklar: [Chrome Android remote debugging](https://developer.chrome.com/docs/devtools/remote-debugging), [Android dumpsys/meminfo](https://developer.android.com/tools/dumpsys), [Android PSI ve LMK tanılama](https://developer.android.com/topic/performance/memory/guide/system-wide-memory).

## Hazırlık (Mac/Linux/Windows)

1. Android SDK **Platform Tools / adb** ve Node 24 kurulmuş olmalı. Android'de geliştirici seçenekleri/USB hata ayıklama etkinleştirilmeli; cihaz bilgisayara güven vermeli. `adb devices -l` çıktısında cihaz `device` olmalı.
2. Android Chrome'da `https://alorak.github.io/pdf/` açılıp kullanıcının 25, 50 veya 100 MB civarındaki **izinli gerçek taranmış** PDF'si dosya seçicisinden açılmalı. Android'de uygulama yükleme tamamlandıktan sonra sayfa sayısı kontrol edilmeli.
3. Bilgisayarda repo kurulmalı; Playwright yalnız CDP için gerekir, yerel Chromium **başlatılmaz**:

```bash
git clone https://github.com/alorak/pdf.git
cd pdf
npm ci
npm install --no-save --package-lock=false @playwright/test@1.56.1
adb devices -l
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

**Örnek, 50 MB civarı gerçek taranmış PDF** (örnekteki adlar temsili; sayfa sayısını gerçek PDF'ye göre değiştirin):

```bash
adb push "/yerel/izinli-gercek-tarama.pdf" /sdcard/Download/p2-10-scan-50.pdf
# Telefonda alorak PDF Viewer ile Download/p2-10-scan-50.pdf dosyasını aç.
node scripts/p2-10-android-soak.mjs \
  --file "/yerel/izinli-gercek-tarama.pdf" \
  --device-file /sdcard/Download/p2-10-scan-50.pdf \
  --pages 250 \
  --minutes 30 \
  --interval 10 \
  --label scan-50
```

`--pages` gerçek PDF sayfa sayısıdır; eşleşmiyorsa koşu **başlamaz**. Aynı prosedür ayrı örnekler için `scan-25`, `scan-75`, `scan-100` gibi farklı etiketlerle tekrarlanır. Fiziksel test tercihen 25–35, 45–60 ve 85–100 MB olmak üzere üç ayrı gerçek taranmış belge üzerinde uygulanır. Testte 15–120 dakika izinlidir; önerilen süre belge başına **30 dakika**. Her PDF için en az üç tekrar (soğuk açılış, arka plan/ön plan ve tekrar yükleme) güvenilir karşılaştırmayı güçlendirir.

## Uygulama ve ölçüm akışı

- Uygulama üzerinde PDF açılır ve ilk/orta/son sayfa ile %27/%73 ara sayfalar arasında otomatik geçiş yapılır. Sayfa numarasının değişmesi **ve** ilgili sayfada gerçek canvas çizilmiş olması şarttır. Gezinme bitiş süreleri, başarısızlıkları ve DOM'un yeniden oluşturulması ayrı raporlanır.
- Başlangıç/son, **minimum, medyan, p95, maksimum Chrome PSS**, Chrome ana süreç PID değişimi, sistem boş RAM ve PSI `some.avg10` değerleri raporlanır. PSS, Chrome paketine yönelik `dumpsys` ölçümüdür; tek PDF sekmesinin veya PDF.js WASM'ının RAM maliyetini izole etmez. Renderer/GPU süreçleri Android sürümüne göre farklı sayılabilir.
- İstenen süre bitince koşucu Android'e `HOME` tuşu yollar ve 15 saniye arka plana alır. Kullanıcı Chrome'daki aynı PDF sekmesine döner ve terminalde Enter'a basar. Önceki sayfaya dönüldüğü kontrol edilir. Ardından **ayrı ve kasıtlı** `page.reload()` yapılarak IndexedDB'de PDF'nin, sayfa numarasının ve aktif çalışma alanının geri geldiği doğrulanır.
- Bu süreç **Chrome'u force-stop yapmaz, LMK/OOM oluşturmaz veya kanıtlamaz**. Chrome arka planda Android tarafından kendiliğinden düşerse sekme durumu/DOM yeniden yüklenmesi tespit edilebilir; bunun nedeninin LMK olduğuna yalnız bu veriyle karar verilmez. Süreç PID değişimi yalnız **yeniden başlama belirtisi** olarak raporlanır; gerçek düşük-bellek öldürme nedenini (LMK) ispatlamak için Android sistem olayları gerekir. Gerçek LMK kanıtı için ayrıca yetkili sistem logcat/Perfetto/lowmemorykiller gözlemleri gerekir.

## Yerel çıktılar ve kabul kriteri

- `test-results/manual/p2-10-android-scan-50.json` — kaynak SHA-256, belge sayfa/raster preflight, anonimleştirilmiş sayısal zaman serisi, gezinme ölçümleri, arka plan/ön plan ve reload kontrolü.
- **Tam ölçüm kanıtı:** 15–120 dakika, örnekleme kapsamı en az %90, en az altı başarılı otomatik gezinme, sıfır zaman aşımı ve kontrol dışı reload, Chrome PSS kapsaması en az %90, PDF geri yükleme başarılı ve dosyanın cihazdaki SHA-256 değeri eşleşmiş olmalı.
- **Bellek performansının iyi olduğu iddiası:** ayrı karar. Yukarıdaki şartların sağlanması **düşük RAM tüketimi veya sızıntısızlık garantisi vermez**. PSS'nin ilk/son farkının 100 MiB üzerinde olması yalnız *inceleme uyarısıdır*; aynı cihazda boşta Chrome referansı, ayrı belge tekrarları ve Android bellek baskısı birlikte değerlendirilmelidir.
- Android Chrome CDP çalışmıyorsa `--mode manual` yalnız PSS/PSI zaman serisini toplar; gerçek kullanıcı gezinmesi ve yeniden açılma davranışını **otomatik doğrulanmış kabul etmez**. Raporda `fieldEvidenceComplete=false` kalır.
- Kasıtlı Chrome `force-stop`, ağ kesintisi veya kasıtlı bellek baskısı oluşturulmaz. Bunlar bağımsız, ayrıca izin gerektiren dayanıklılık senaryolarıdır.

## Gizlilik ve sınırlamalar

PDF baytları, dosya yolu, Chrome URL'si, seri numarası, tarayıcı geçmişi, ADB ham dökümü, logcat ve ekran görüntüsü **repo veya rapora kaydedilmez**. JSON içinde cihaz modeli ve Android sürümü bulunur. Ölçümler kullanıcının bilgisayarında çalışır; dosya yalnız kullanıcı isterse ADB üzerinden kendi Android cihazına kopyalanır. Buradaki CI unit testleri **sentetik/protokol doğrulamasıdır, gerçek Android cihaz ölçümü değildir**.

İlgili eski araç: `npm run android:snapshot -- baseline|large-open|navigate|workspace|reopen|report` (beş tekil fotoğraf). P2.10 uzun süreli zaman serisiyle bunların yerine geçmez, tamamlar.

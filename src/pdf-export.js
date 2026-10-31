import { PDFDocument } from "pdf-lib";

/**
 * Copy original PDF page objects rather than rasterizing canvas previews.
 * Missing/replaced sources fail closed: never export a silent substitute page.
 * The result is a standalone PDF; no workspace/IndexedDB writes are performed.
 */
export async function exportLinkedPages({
  workspace, workspaces, loadFile, onProgress = () => {}, isCancelled = () => false,
}) {
  if (!workspace || workspace.fileName || workspace.mode !== "pages" ||
    !Array.isArray(workspace.linkedPages) || !workspace.linkedPages.length) {
    throw new Error("Dışa aktarmak için sayfa derlemesi seçmelisin.");
  }
  const sourceDocs = new Map();
  const output = await PDFDocument.create();
  const total = workspace.linkedPages.length;
  const ensureCurrent = () => {
    if (isCancelled()) throw new Error("PDF dışa aktarma iptal edildi.");
  };
  for (const [index, ref] of workspace.linkedPages.entries()) {
    ensureCurrent();
    const source = workspaces.find(item => item.id === ref.sourceWorkspaceId);
    if (!source || source.fileName !== ref.sourceFileName) {
      throw new Error(`W${ref.sourceWorkspaceId} kaynak PDF değişmiş veya silinmiş. Önce kaynağı geri yükle.`);
    }
    const key = JSON.stringify([
      ref.sourceWorkspaceId, ref.sourceFileName, ref.sourceSize, ref.sourceLastModified,
    ]);
    let doc = sourceDocs.get(key);
    if (!doc) {
      const file = await loadFile(ref.sourceWorkspaceId);
      ensureCurrent();
      if (!file || file.name !== ref.sourceFileName || file.size !== ref.sourceSize ||
        file.lastModified !== ref.sourceLastModified) {
        throw new Error(`W${ref.sourceWorkspaceId} kaynak dosyası doğrulanamadı. Derleme değiştirilmedi.`);
      }
      try {
        doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
          updateMetadata: false,
        });
      } catch (error) {
        throw new Error(`W${ref.sourceWorkspaceId} kaynağı PDF olarak dışa aktarılamadı: ${error.message}`);
      }
      ensureCurrent();
      sourceDocs.set(key, doc);
    }
    if (!Number.isSafeInteger(ref.page) || ref.page < 1 || ref.page > doc.getPageCount()) {
      throw new Error(`W${ref.sourceWorkspaceId} dosyasında ${ref.page}. sayfa bulunamadı.`);
    }
    const copied = await output.copyPages(doc, [ref.page - 1]);
    output.addPage(copied[0]);
    onProgress({ completed: index + 1, total });
  }
  ensureCurrent();
  const bytes = await output.save({ useObjectStreams: true });
  ensureCurrent();
  return bytes;
}

/**
 * A read-only virtual PDF document. Pages are resolved from the original
 * workspace PDFs; nothing is merged or copied into IndexedDB.
 */
export async function openLinkedDocument({ references, workspaces, loadFile, pdfjs, base = null, isCancelled = () => false }) {
  const tasks = [];
  let disposed = false;
  const mapping = [];
  const documentById = new Map();
  const destroy = async () => {
    if (disposed) return;
    disposed = true;
    await Promise.all(tasks.map((task) => task.destroy().catch(() => {})));
    tasks.length = 0;
  };
  const ensureCurrent = () => {
    if (disposed || isCancelled()) throw new Error("PDF sayfaları açma işlemi iptal edildi.");
  };
  const openFile = async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    ensureCurrent();
    const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
    tasks.push(task);
    const documentPdf = await task.promise;
    ensureCurrent();
    return documentPdf;
  };
  try {
    if (base) {
      const main = await openFile(base);
      for (let page = 1; page <= main.numPages; page++) mapping.push({ documentPdf: main, page });
    }
    for (const reference of references) {
      ensureCurrent();
      const sourceId = reference.sourceWorkspaceId;
      const source = workspaces.find((item) => item.id === sourceId);
      if (!source || source.fileName !== reference.sourceFileName) {
        throw new Error(`W${sourceId} kaynak workspace PDF'si değişmiş veya silinmiş.`);
      }
      let doc = documentById.get(sourceId);
      if (!doc) {
        const file = await loadFile(sourceId);
        ensureCurrent();
        if (!file || file.name !== reference.sourceFileName ||
          file.size !== reference.sourceSize || file.lastModified !== reference.sourceLastModified) {
          throw new Error(`W${sourceId} kaynak PDF değişmiş veya bulunamadı.`);
        }
        doc = await openFile(file);
        documentById.set(sourceId, doc);
      }
      if (!Number.isSafeInteger(reference.page) || reference.page < 1 ||
          reference.page > doc.numPages) {
        throw new Error(`W${sourceId} PDF'sinde sayfa ${reference.page} bulunamadı.`);
      }
      mapping.push({ documentPdf: doc, page: reference.page });
    }
    ensureCurrent();
    if (!mapping.length) throw new Error("Görüntülenecek PDF sayfası yok.");
    return {
      numPages: mapping.length,
      getPage(index) {
        if (disposed || !Number.isSafeInteger(index) || index < 1 || index > mapping.length) {
          return Promise.reject(new Error("Geçersiz sayfa."));
        }
        const { documentPdf, page } = mapping[index - 1];
        return documentPdf.getPage(page);
      },
      getMetadata: async () => ({ info: { Title: "Workspace sayfa derlemesi" }, metadata: null }),
      destroy,
      sources: mapping.map((entry) => entry.page),
    };
  } catch (error) {
    await destroy();
    throw error;
  }
}

export function isLinkedOnlyWorkspace(workspace) {
  return Boolean(workspace && !workspace.fileName && workspace.linkedPages?.length);
}

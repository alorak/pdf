export const LINKED_DOCUMENT_NAME = "@workspace-linked-pages";

/** A minimal one-page PDF used for missing references; page positions remain stable. */
function missingSourcePdf() {
  const stream = "BT /F1 19 Tf 62 738 Td (SOURCE PDF UNAVAILABLE) Tj 0 -35 Td /F1 12 Tf (Check Library storage and source workspace) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const startxref = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Uint8Array.from(pdf, char => char.charCodeAt(0));
}

/**
 * A read-only virtual PDF document. Pages are resolved from the original
 * workspace PDFs; nothing is merged or copied into IndexedDB.
 */
export async function openLinkedDocument({ references, workspaces, loadFile, pdfjs, base = null, isCancelled = () => false }) {
  const tasks = [];
  let disposed = false;
  const mapping = [];
  const documentById = new Map();
  const missing = [];
  let placeholderPromise = null;
  const placeholder = () => {
    if (!placeholderPromise) placeholderPromise = openFile(missingSourcePdf());
    return placeholderPromise;
  };
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
      const sourceKey = JSON.stringify([
        sourceId, reference.sourceFileName, reference.sourceSize, reference.sourceLastModified,
      ]);
      let doc = documentById.get(sourceKey);
      let valid = Boolean(doc);
      if (!documentById.has(sourceKey)) {
        try {
          if (!source || source.fileName !== reference.sourceFileName) throw new Error("Source changed");
          const file = await loadFile(sourceId);
          ensureCurrent();
          if (!file || file.name !== reference.sourceFileName ||
            file.size !== reference.sourceSize || file.lastModified !== reference.sourceLastModified) {
            throw new Error("Source file identity mismatch");
          }
          doc = await openFile(file);
          valid = true;
        } catch (error) {
          ensureCurrent();
          console.warn("Linked PDF source unavailable:", sourceId, error);
          doc = null;
          valid = false;
        }
        documentById.set(sourceKey, doc);
      }
      if (valid && Number.isSafeInteger(reference.page) && reference.page >= 1 &&
        reference.page <= doc.numPages) {
        mapping.push({ documentPdf: doc, page: reference.page });
      } else {
        const blank = await placeholder();
        ensureCurrent();
        mapping.push({ documentPdf: blank, page: 1 });
        missing.push({ workspaceId: sourceId, page: reference.page,
          fileName: reference.sourceFileName, virtualPage: mapping.length });
      }
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
      missing,
    };
  } catch (error) {
    await destroy();
    throw error;
  }
}

export function isLinkedOnlyWorkspace(workspace) {
  return Boolean(workspace && !workspace.fileName &&
    (workspace.mode === "pages" || workspace.linkedPages?.length));
}

export function workspaceDocumentName(workspace) {
  return workspace?.fileName || (isLinkedOnlyWorkspace(workspace) ? LINKED_DOCUMENT_NAME : "");
}

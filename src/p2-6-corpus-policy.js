
import { resolve, sep, isAbsolute } from "node:path";

/** Only explicitly authorized, locally provided PDFs may enter P2.6. */
export function validateCorpusManifest(manifest) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.cases)
      || manifest.cases.length < 1 || manifest.cases.length > 40) {
    throw new Error("P2.6 manifest needs version 1 and 1..40 cases");
  }
  const ids = new Set();
  return manifest.cases.map(item => {
    if (!item || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(item.id || "")
      || typeof item.file !== "string" || !item.file.toLowerCase().endsWith(".pdf")
      || isAbsolute(item.file) || item.file.includes("\\")
      || typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(item.sha256)
      || item.rightsConfirmed !== true || typeof item.rightsBasis !== "string"
      || item.rightsBasis.trim().length < 4 || item.rightsBasis.length > 120
      || !["present", "none", "either"].includes(item.text)
      || !Number.isSafeInteger(item.minImagePages) || item.minImagePages < 0
      || item.minImagePages > 3 || ids.has(item.id)) {
      throw new Error("Invalid, unlicensed, missing SHA or duplicated corpus case");
    }
    ids.add(item.id);
    const segments = item.file.split("/");
    if (segments.some(part => part === ".." || part === "." || !part)) {
      throw new Error("Unsafe corpus path");
    }
    return item;
  });
}

export function corpusFilePath(root, localPath) {
  if (typeof localPath !== "string" || !localPath.toLowerCase().endsWith(".pdf")
      || isAbsolute(localPath) || localPath.includes("\\")) throw new Error("Unsafe corpus PDF path");
  const target = resolve(root, localPath);
  if (!target.startsWith(resolve(root) + sep)) throw new Error("Corpus path outside manifest root");
  return target;
}

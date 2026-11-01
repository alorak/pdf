import { createHash } from "node:crypto";

/**
 * Original, locally authored codec samples. 16-bit grayscale J2K was
 * losslessly compressed with Pillow/OpenJPEG 2.5.4, and the small custom
 * CMYK -> XYZ ICC v2 profile was generated with LittleCMS2 CLUT.
 *
 * ICC intentionally swaps C and M channels: a DeviceCMYK fallback renders
 * visibly DIFFERENT values, making the ICC conversion observable.
 * Ground-truth RGB is an independent LittleCMS2 -> sRGB transform.
 *
 * Base64 is original test DATA only: no third-party profile, PDF or image.
 */
const ORIGINAL = Object.freeze({
  icc:"AAAC6GxjbXMCQAAAcHJ0ckNNWUtYWVogB+oACwABAA4AHwAOYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACd3RwdAAAAJwAAAAUQTJCMAAAALAAAAI2WFlaIAAAAAAAAPbWAAEAAAAA0y1tZnQyAAAAAAQDAwAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAgACAAD//wAA//8AAP//AAD//3tsgABpoD22QAA00AAAAAAAAHJDfB876zkiPg8d9gAAAAAAAGkbeD4ONjSOPB8HGwAAAAAAAF+DccJovC/BOOE0XgAAAAAAAFZbbeE7BystNvEdhAAAAAAAAE0yagANUiaZNQAGqQAAAAAAAEOaY4Vn2CHNMcIz7AAAAAAAADpyX6Q6Ix05L9IdEQAAAAAAADFKW8MMbhilLeEGNwAAAAAAAGLHUh9jajFjKQ8xtQAAAAAAAFmeTj41tSzPJx8a2gAAAAAAAFB2SlwH/yg7JS4EAAAAAAAAAEbeQ+FihSNvIfExQwAAAAAAAD22QAA00B7bIAAaaAAAAAAAADSOPB8HGxpHHg8DjgAAAAAAACr1NaRhoRV7GtIw0AAAAAAAACHNMcIz7BDnGOEZ9gAAAAAAABilLeEGNwxSFvEDGwAAAAAAAEoiJD1dMyUREh8umQAAAAAAAED6IFwvfiB9EC4XvwAAAAAAADfRHHsByRvpDj4A5AAAAAAAAC45FgBcThcdCwAuJwAAAAAAACUREh8umRKICQ8XTQAAAAAAABvpDj4A5A30Bx8AcgAAAAAAABJQB8JbagkoA+EttQAAAAAAAAkoA+EttQSUAfEW2wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//8AAP//AAD//wAA",
  jpx16:"/0//UQApAAAAAABAAAAAQAAAAAAAAAAAAAAAQAAAAEAAAAAAAAAAAAABDwEB/1IADAAAAAEABQQEAAH/XAATQICIiJCIiJCIiJCIiJCIiJD/ZAAlAAFDcmVhdGVkIGJ5IE9wZW5KUEVHIHZlcnNpb24gMi41LjT/kAAKAAAAAAG/AAH/k8/8MCQJFS+40FWVHxfH/hgNAD8ASAA+oDANAgZAbD8DwWaFDncvw/8DBcAfmEQA/MEAIhoT+HjaE+psMD8VNbQU5ujhPyHH/3/AfyIQB+ZFAP5BADbt0lNh/bM+QUy+LAlUsy8L9UQorgVATxG1Pf8mVbhVc18PMizhIiaSPZwkQX6ZvBOzNjSxv8P/AxFA/wWIP/BgQF2jFnnE+jDgkE8XB1m0Cx5Ya+SCOKlGEfSq0NYYn0NZkBVfUnn9wQ/PlnjfAlIpJwb4tVDu+mHsmoIAAAAAVQkKMX6px78pNdyC6YPqkAfSSGrhG8DNYQEO/UMNXCN4Gay/rhwqQzQ1cI3gZq/KlwajzQ1cI3gZq+elX1GQht/4wVw/8GYo/2JAgIr10yNM7d29+5AxggAYR6D2EhL7o8gAAYR2E1kJeip/vHRhwrL6hGk7EkeLS/vz0Iyix/esUf2zM4yPAGnCTGtAkIJMotxxoA4tTiGRm3HA2RhkqAAD20/4NBjs8DZGGSoAAAr8/2Fug7PA2RhkqAAAIj2fBBkdngbIwyVAAADrSPBjodngbIwyVAAAP4tMgX//2Q==",
  cmykFlate:"eNrtz00rBAEAxvFl87JelvG+rNhB5CUvwxKhNJEcSE24KGSKXHAYRbmgKVyEmgsuokkoKeyJg8RKIRdcRHKwueAifIPnC8zzr98H+NtsOI9DsCMNcWIo0pcmOZCpbDkKWS9SYpBTrxqHvNZriYiN//znP//5z38L/odlCZFIXqHoRJorJAEZrJMTkNkmJRnZalNTkcsuLR0J9OqZCP/5z3/+85//Vvx3NopJSHGr5ELaOmU3MtyjZCALg6qI7I1qOcjthJ6HfE4bBQj/+c9//vOf/1b8TxyQPIh3RM5GOsaVXGRsSs1HjHmtCDla1kuQ+1VDQn42TS/Cf/7zn//8578V/91zciFSu6QUI90rahkyuaFVIGu7ehVyfGjUIE8nZh1iv/AFIfznP//5z3/+W/E/a0epROQDtRrpP9ZqkZlz3YZs3Bh25OzBDEXeXnwOJCLgj0L4z3/+85///Lfif/61Goy03GshyNCzHo7MvxuRyPaX6USu/nwC8hHuT0AE4TEZ4T//+c9//vPfiv+ln1o00v6rxyKjYUY8shhrJiH7Lp8LuRP9buS74DEDSSkPiAj/+c9//vOf/1b8/wdmt4Fp",
  iccRgbPatchPalette:"////+u/39d3u8crl7LTb5pzR4X3G21K67Pf15+fs4tXj3MLZ1qzP0ZPDynS3xESt1+/q0d/hy83XxbrMvqTBt4q1sGmqqiijv+ffuNfVscXKq7G+p5uyooGonV6gmAyXp9/So87Hnr28mamvlJOkjnichlKUfP2NldfFj8a5h7Ssfbe2c56qZ36cWVCNSfV7dOvLaNm/WsW2Sq+qKJWcAHSN9EB78e1mLOO9BNGz9b2q8aac7oyN6Wl74yFm3uVJ",
});

const sha256 = x => createHash("sha256").update(x).digest("hex");
function verified(key, digest) {
  const bytes = Buffer.from(ORIGINAL[key], "base64");
  if (sha256(bytes) !== digest) throw new Error("P2.8 original reference corrupt: " + key);
  return bytes;
}

export const ADVANCED_SIZE = 64;
export const ADVANCED_CASES = Object.freeze({
  jpx16: {
    filter: "/JPXDecode", colorSpace: "/DeviceGray", bits: 16,
    inputSha256: "e36ee8c79e535df29da2444e4b79495d6f52218982b8925d9b291541721a12b9",
    referenceSha256: "02537441b1729381b0e56c0aa11432908fc422df2e637ba4807d65a620593ceb",
  },
  iccCmyk: {
    filter: "/FlateDecode", colorSpace: "/ICCBased", bits: 8,
    inputSha256: "df1317587e06294bddb4f2751006102becaf195c2328428782b91cbec7e55bf0",
    profileSha256: "61a637e6155cadea8cee322639f6304c1162a08f167040631cde6adfe784fff5",
    referenceSha256: "63223e0ebb77c7a124cc38350283015049e9d0cf16f42136bc99ec0de80c4d82",
  },
});

export function advancedSource(kind) {
  if (!(kind in ADVANCED_CASES)) throw new RangeError("Unknown advanced codec");
  return kind === "jpx16"
    ? verified("jpx16", ADVANCED_CASES.jpx16.inputSha256)
    : verified("cmykFlate", ADVANCED_CASES.iccCmyk.inputSha256);
}
export function embeddedIcc() {
  return verified("icc", ADVANCED_CASES.iccCmyk.profileSha256);
}

/** Independent oracle: Pillow 12 + OpenJPEG for J2K; LCMS2 CMYK to sRGB. */
export function referenceRgb(kind) {
  if (kind === "jpx16") {
    const gray = Buffer.alloc(ADVANCED_SIZE * ADVANCED_SIZE);
    for (let y = 0; y < ADVANCED_SIZE; y++) for (let x = 0; x < ADVANCED_SIZE; x++) {
      const value = (Math.floor(x * 65535 / 63) + ((y * 127) % 1024)) % 65536;
      gray[y * ADVANCED_SIZE + x] = Math.round(value * 255 / 65535);
    }
    if (sha256(gray) !== ADVANCED_CASES.jpx16.referenceSha256) throw Error("Golden mismatch");
    const rgb = Buffer.alloc(ADVANCED_SIZE * ADVANCED_SIZE * 3);
    for (let i = 0; i < gray.length; i++) rgb.fill(gray[i], i * 3, i * 3 + 3);
    return rgb;
  }
  if (kind === "iccCmyk") {
    const palette = Buffer.from(ORIGINAL.iccRgbPatchPalette, "base64");
    if (palette.length !== 8 * 8 * 3) throw Error("Golden RGB patch count mismatch");
    const rgb = Buffer.alloc(ADVANCED_SIZE * ADVANCED_SIZE * 3);
    for (let y = 0; y < ADVANCED_SIZE; y++) for (let x = 0; x < ADVANCED_SIZE; x++) {
      const src = (Math.floor(y / 8) * 8 + Math.floor(x / 8)) * 3;
      const dest = (y * ADVANCED_SIZE + x) * 3;
      rgb.set(palette.subarray(src, src + 3), dest);
    }
    if (sha256(rgb) !== ADVANCED_CASES.iccCmyk.referenceSha256) throw Error("Golden mismatch");
    return rgb;
  }
  throw new RangeError("Unknown advanced reference codec");
}

/** All three pages are unrotated and 64x64 points; 1 PDF point = 1 canvas pixel at scale 1. */
export function advancedPdf(kind) {
  const settings = ADVANCED_CASES[kind];
  if (!settings) throw new RangeError("Unknown advanced PDF codec");
  const image = advancedSource(kind);
  const icc = embeddedIcc();
  const colorSpace = kind === "jpx16" ? "/DeviceGray" : "[/ICCBased 8 0 R]";
  const objects = [];
  const offsets = [0];
  let length = 0;
  function append(x) {
    const buffer = typeof x === "string" ? Buffer.from(x, "latin1") : x;
    objects.push(buffer); length += buffer.length;
  }
  function obj(id, ...parts) {
    offsets[id] = length;
    append(id + " 0 obj\n");
    for (const part of parts) append(part);
    append("\nendobj\n");
  }
  append("%PDF-1.7\n%\xD1\xD2\xD3\xD4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Count 3 /Kids [4 0 R 5 0 R 6 0 R] >>");
  const drawing = Buffer.from("q 64 0 0 64 0 0 cm /Img Do Q\n","ascii");
  obj(3, "<< /Length " + drawing.length + " >>\nstream\n", drawing, "\nendstream");
  for (const id of [4,5,6]) {
    obj(id, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 64 64] /Resources ",
      "<< /XObject << /Img 7 0 R >> >> /Contents 3 0 R >>");
  }
  obj(7, "<< /Type /XObject /Subtype /Image /Width 64 /Height 64 ",
    "/BitsPerComponent " + settings.bits + " /ColorSpace " + colorSpace,
    " /Filter " + settings.filter + " /Length " + image.length + " >>\nstream\n",
    image, "\nendstream");
  obj(8, "<< /N 4 /Alternate /DeviceCMYK /Length " + icc.length + " >>\nstream\n",
    icc, "\nendstream");
  const xref = length;
  append("xref\n0 9\n0000000000 65535 f \n");
  for (let id = 1; id <= 8; id++) append(String(offsets[id]).padStart(10,"0") + " 00000 n \n");
  append("trailer\n<< /Root 1 0 R /Size 9 >>\nstartxref\n" + xref + "\n%%EOF\n");
  return Buffer.concat(objects, length);
}

export function advancedManifest(kind) {
  const pdf = advancedPdf(kind);
  return { kind, bytes: pdf.length, pages: 3, imageBits: ADVANCED_CASES[kind].bits,
    filter: ADVANCED_CASES[kind].filter, inputSha256: ADVANCED_CASES[kind].inputSha256,
    profileSha256: kind === "iccCmyk" ? ADVANCED_CASES[kind].profileSha256 : null,
    pdfSha256: sha256(pdf),
    referenceSha256: ADVANCED_CASES[kind].referenceSha256 };
}

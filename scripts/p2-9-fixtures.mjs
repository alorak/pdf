import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

/**
 * Original P2.9 test assets — not third-party ICC/JP2 blobs.
 * - JP2: OpenCV 4.13/OpenJPEG 2.5.3, lossless 64x64, unsigned 16-bit BGR source
 *   converted to three-component JPEG2000 via JP2 container.
 * - ICC: LittleCMS2 cmsCreateRGBProfile with D65/sRGB primaries,
 *   linear (gamma=1) curves, saved as ICC v4.3, 600 bytes.
 * Reference RGB: independently generated with Pillow ImageCms / LittleCMS2.
 */
export const ORIGINAL_JP2_RGB16 = "AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAQAAAAEAAAw8HAAAAAAAPY29scgEAAAAAABAAAAPPanAyY/9P/1EALwAAAAAAQAAAAEAAAAAAAAAAAAAAAEAAAABAAAAAAAAAAAAAAw8BAQ8BAQ8BAf9SAAwAAAABAAUEBAAB/1wAE0CAiIiQiIiQiIiQiIiQiIiQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS4z/5AACgAAAAADSAAB/5Pf+JBQBUdN0hyMw9H5P9/4kEgJT2BQqFCgK9/f+JBABp9jEK2vB3XP/Egqf+JBUP9hgUADTE2vQQIfuGbvAVGIxyMTianHVwALdcLZ64/Fxw/H/hgSAAgYn3bzot5FX6P/BgSACaHUjZHDS5oDz/xIWn/iQvD/YYGgFoSrfSEQ3V0APSieWKYmoWTxaLZGIhai8mYbIEInwCaa4FFPG/zyPNtWabtvFqgskOtgGy+5KoLOT8f+GCQAFyrhOC5/ovtQstTBQKBQKBQJo/8GCYAMdngcyjXGiTelhYItFIpFIpFHz/xIhn/iRDH/RIMAIhjafeMW+rKlLpMVXmDf3pdFtoHXjP2pGv8WLutkL9X3A3glAnolVOc9wFGqnhpk807i2xb15Wis1KOu/w65GOd/JCwIzHIaDtN5QlMCz/xIjCFuDGRXCcIELwZqYNVz/kOX5Dl+Q5fkOX5Dl+Q5fkOX5Dl/p/4kQgDUxuGiNpvwB7P07Z1RrnQ1zoa50Nc6GudDXOhrnQ1zn8/8SNp/4kbR/0SCwDaeOPwyViQqPZeeTx1RikGNggbG1vDdq90OzJyNkHATgrYSOCtZDoVptmCtNswVptmCtNswT2at7ZcppyJHP1Z02McFDGjNM8dJE+wMf4fWP45bJMLsW+hhnW791Q3fnkG76lHu+pR7vqUe74MU9aXRq05ZCPf7z/xI+DXyP+N9y8rIsVsHHLxuvnHr2DYbArJBsNfnsA2GvnHgbDXvOoNhsgwEGw2QYCDYbIMBBsNkGAg2GyDAQbDXp/4kdGdqqvAOHifpVUAwkEfAB8az9iRRX+bEB+R82ICfT5sQDHxzYgD/VzYgC+XmxADh+bEAOH5sQA4fmw/P/EkGf+JIUf9EgYBfpscnb/Aa4uShGgvIDBSW7SkGHtzYgEMnmxABT+bEAFP5sQAU/mxABT+bEAFP5sQAU/mxABT+bEAFP5sQAU/mw8Q2ShQCVuNDMlCOwe4DBhPZpSE/O5sQG3jzYgGdfmxAIe/NiAMwebEAU2c2IAVPzYgBU/NiAFT82IAVPzYgBU/Nh8g3Yqf/f8f+GBAAXvrFP5v8/3+j/wYEAMQw6o6JWHx//9k=";
export const ORIGINAL_ICC_V4 = "AAACWGxjbXMEMAAAbW50clJHQiBYWVogB+oACwABABAALwAmYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA0Y3BydAAAATwAAABMd3RwdAAAAYgAAAAUY2hhZAAAAZwAAAAsclhZWgAAAcgAAAAUYlhZWgAAAdwAAAAUZ1hZWgAAAfAAAAAUclRSQwAAAgQAAAAQZ1RSQwAAAhQAAAAQYlRSQwAAAiQAAAAQY2hybQAAAjQAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAYAAAAHABSAEcAQgAgAGIAdQBpAGwAdAAtAGkAbm1sdWMAAAAAAAAAAQAAAAxlblVTAAAAMAAAABwATgBvACAAYwBvAHAAeQByAGkAZwBoAHQALAAgAHUAcwBlACAAZgByAGUAZQBsAHlYWVogAAAAAAAA9tYAAQAAAADTLXNmMzIAAAAAAAEMQgAABd7///MlAAAHkwAA/ZD///uh///9ogAAA9wAAMBuWFlaIAAAAAAAAG+gAAA49QAAA5BYWVogAAAAAAAAJJ8AAA+EAAC2w1hZWiAAAAAAAABilwAAt4cAABjZcGFyYQAAAAAAAAAAAAEAAHBhcmEAAAAAAAAAAAABAABwYXJhAAAAAAAAAAAAAQAAY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c";
export const P29_ASSET_SHA = Object.freeze({
  jp2: "d1047dbbfbac5693e62d5308c9fc5f8706d2747c46abc3db67674d912788fe70",
  icc: "6d5c6456811b67558cad999a838eed965d4f01cb3efb8a643ba1755281d1143c",
});
export const RGB8_SWATCHES = Object.freeze([
  [64,64,64],[128,64,32],[180,120,60],[200,160,100],
]);
export const V4_LCMS_REFERENCE = Object.freeze([
  [137,137,137],[188,137,99],[219,182,133],[229,208,168],
]);
export const JP2_RGB16_REFERENCE = Object.freeze([
  [255,0,0],[0,255,0],[0,0,255],[255,255,255],
]);
const W=64, H=64;
const hash=b=>createHash("sha256").update(b).digest("hex");
const quadrant=(x,y)=>(y>=32?2:0)+(x>=32?1:0);

export function p29IccV4() {
  const buf=Buffer.from(ORIGINAL_ICC_V4,"base64");
  if(hash(buf)!==P29_ASSET_SHA.icc || buf.readUInt32BE(0)!==buf.length ||
     buf[8]!==4 || buf.toString("ascii",36,40)!=="acsp" ||
     buf.toString("ascii",16,20)!=="RGB ")
    throw new Error("P2.9 invalid original ICC v4 fixture");
  return buf;
}
export function p29Jpx16Rgb() {
  const buf=Buffer.from(ORIGINAL_JP2_RGB16,"base64");
  if(hash(buf)!==P29_ASSET_SHA.jp2 ||
     buf.toString("ascii",4,8)!=="jP  ")
    throw new Error("P2.9 invalid original 16-bit RGB JP2");
  const siz=buf.indexOf(Buffer.from([0xff,0x51]));
  if(siz<0 || buf.readUInt16BE(siz+38)!==3 ||
     ![0,1,2].every(c=>buf[siz+40+c*3]===15))
    throw new Error("P2.9 JPEG2000 must have three unsigned 16-bit components");
  return buf;
}
export function p29ReferenceRgb(kind) {
  if(!["jpx-rgb16","icc-v4-rgb"].includes(kind)) throw new RangeError("Unknown P2.9 kind");
  const palette=kind==="jpx-rgb16"?JP2_RGB16_REFERENCE:V4_LCMS_REFERENCE;
  const result=Buffer.alloc(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    result.set(palette[quadrant(x,y)],(y*W+x)*3);
  }
  return result;
}
export function p29RgbPixels(kind) {
  const colors=kind==="icc-v4-rgb"?RGB8_SWATCHES:null;
  if(!colors)return null;
  const result=Buffer.alloc(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)
    result.set(colors[quadrant(x,y)],(y*W+x)*3);
  return result;
}

/** Builds a 64x64 single-page PDF; external profiles are never bundled. */
export function buildP29Pdf({kind,profile=null}) {
  if(!["jpx-rgb16","icc-v4-rgb","external-cmyk"].includes(kind))
    throw new RangeError("Unknown P2.9 PDF fixture");
  const isJpx=kind==="jpx-rgb16", isCmyk=kind==="external-cmyk";
  if(isCmyk && (!Buffer.isBuffer(profile) || profile.length<128 ||
      profile.toString("ascii",36,40)!=="acsp" ||
      profile.toString("ascii",16,20)!=="CMYK"))
    throw new Error("External profile requires a real CMYK ICC");
  const icc=isJpx?null:(isCmyk?profile:p29IccV4());
  const rgb=p29RgbPixels(kind);
  const image=isJpx?p29Jpx16Rgb():deflateSync(isCmyk?externalCmykPixels():rgb);
  const attrs=isJpx?"/BitsPerComponent 16 /ColorSpace /DeviceRGB /Filter /JPXDecode":
    "/BitsPerComponent 8 /ColorSpace [/ICCBased 6 0 R] /Filter /FlateDecode";
  const chunks=[], offsets=[0];let length=0;
  const append=v=>{const b=typeof v==="string"?Buffer.from(v,"latin1"):v;chunks.push(b);length+=b.length;};
  const obj=(id,parts)=>{offsets[id]=length;append(id+" 0 obj\n");parts.forEach(append);append("\nendobj\n");};
  append("%PDF-1.7\n%\xc1\xd2\xd3\xe4\n");
  obj(1,["<< /Type /Catalog /Pages 2 0 R >>"]);
  obj(2,["<< /Type /Pages /Count 1 /Kids [3 0 R] >>"]);
  obj(3,["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 64 64] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>"]);
  const draw=Buffer.from("q 64 0 0 64 0 0 cm /Im0 Do Q\n","ascii");
  obj(4,["<< /Length "+draw.length+" >>\nstream\n",draw,"\nendstream"]);
  obj(5,["<< /Type /XObject /Subtype /Image /Width 64 /Height 64 ",attrs,
    " /Length "+image.length+" >>\nstream\n",image,"\nendstream"]);
  if(icc) obj(6,["<< /N "+(isCmyk?4:3)+" /Alternate /Device"+(isCmyk?"CMYK":"RGB")+
    " /Length "+icc.length+" >>\nstream\n",icc,"\nendstream"]);
  const count=isJpx?5:6, xref=length;
  append("xref\n0 "+(count+1)+"\n0000000000 65535 f \n");
  for(let id=1;id<=count;id++)append(String(offsets[id]).padStart(10,"0")+" 00000 n \n");
  append("trailer\n<< /Size "+(count+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n");
  return Buffer.concat(chunks,length);
}
export function externalCmykPixels() {
  const pixels=Buffer.alloc(W*H*4);
  const swatches=[[255,0,0,0],[0,255,0,0],[0,0,255,0],[0,0,0,255]];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)
    pixels.set(swatches[quadrant(x,y)],(y*W+x)*4);
  return pixels;
}
export function p29Manifest(kind) {
  const pdf=buildP29Pdf({kind});
  const reference=p29ReferenceRgb(kind);
  return {kind,pdfSha256:hash(pdf),referenceSha256:hash(reference),
    bytes:pdf.length,referencePixels:4096,sourceBpc:kind==="jpx-rgb16"?16:8};
}

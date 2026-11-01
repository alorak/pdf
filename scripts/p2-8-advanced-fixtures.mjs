import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

/**
 * P2.8 fully original test corpus. No third-party ICC binary is embedded:
 * the 4->3 channel ICC v2 LUT profile is constructed from the ISO tag layout.
 * Reference colors were checked against independent LittleCMS 2.19 via Pillow.
 */
const JPX_16 = "/0//UQApAAAAAABAAAAAQAAAAAAAAAAAAAAAQAAAAEAAAAAAAAAAAAABDwEB/1IADAAAAAEABQQEAAH/XAATQICIiJCIiJCIiJCIiJD/ZAAlAAFDcmVhdGVkIGJ5IE9wZW5KUEVHIHZlcnNpb24gMi41LjT/kAAKAAAAAAFJAAH/k9/4kFAHqroVY30Xe9hRw/8DBEf+GBIIJH2F0Y6v+gmn/mIIx1fuv8P/AwhH/hggFyrhYzVuxcMYu2jdm5EzRwx2eDWcXytMvQgBRg3FmevD/wMQx/4YHiFuDGRVqcWYDEwONhLvnuX57l+e5fnuX57l+e5fnuX/fwDUxuGgwgttlxgGEhL/f8P/AxJH/hhENfI/4tI7GASIwAyyAFglfyM/D2K5PaxnQPwriirC6Q9iuGy/Z2qq7/ie/CPSoAAAwLxa9tYYMGsEUHQMFsCCKrqGCulpL8P/AxbH/hhiXvrFP/971tAGEfyEIkBo7CP/AqI/8FRH/gqI/2Coj/wVEf9BUR/4KiP/AqI/xDDqjp7W1/wBhH+tuJAqPokBufCQFO0SAp2iQFO0SAp2iQFO0SAp2iQFO0SAp2iQf//Z";
const SIZE = 64;
const fx = value => Math.round(value * 65536);

export function makeTestCmykIccProfile() {
  const put32 = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
  const xyz = (x,y,z) => Buffer.concat([Buffer.from("XYZ \0\0\0\0","latin1"),
    put32(fx(x)),put32(fx(y)),put32(fx(z))]);
  const header = Buffer.alloc(128);
  header.write("P28!",4,"ascii"); header.writeUInt32BE(0x02200000,8);
  header.write("prtr",12,"ascii");header.write("CMYK",16,"ascii");
  header.write("XYZ ",20,"ascii");header.write("acsp",36,"ascii");
  [0.9642,1,0.8249].forEach((v,i)=>header.writeInt32BE(fx(v),68+i*4));
  header.write("P28!",80,"ascii");
  const lut = [Buffer.from("mft1\0\0\0\0","latin1"),Buffer.from([4,3,2,0])];
  for(let i=0;i<9;i++)lut.push(put32(fx([0,4,8].includes(i)?1:0)));
  for(let i=0;i<4;i++)lut.push(Buffer.from(Array.from({length:256},(_,x)=>x)));
  const matrix = [[.4360747,.3850649,.1430804],
    [.2225045,.7168786,.0606169],[.0139322,.0971045,.7141733]];
  for(let c=0;c<2;c++)for(let m=0;m<2;m++)for(let y=0;y<2;y++)for(let k=0;k<2;k++){
    const srgb=[(1-c)*(1-k),(1-m)*(1-k),(1-y)*(1-k)];
    const lin=srgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    lut.push(Buffer.from(matrix.map(row=>Math.min(255,Math.max(0,
      Math.round(row.reduce((s,n,i)=>s+n*lin[i],0)*255))))));
  }
  for(let i=0;i<3;i++)lut.push(Buffer.from(Array.from({length:256},(_,x)=>x)));
  const tags=[["wtpt",xyz(.9642,1,.8249)],["A2B0",Buffer.concat(lut)]];
  const table=Buffer.alloc(4+tags.length*12);table.writeUInt32BE(tags.length,0);
  let at=128+table.length;const pieces=[];
  for(let i=0;i<tags.length;i++){
    const [key,body]=tags[i];
    table.write(key,4+i*12,"ascii");table.writeUInt32BE(at,8+i*12);
    table.writeUInt32BE(body.length,12+i*12);
    const padding=Buffer.alloc((4-body.length%4)%4);
    pieces.push(body,padding);at+=body.length+padding.length;
  }
  header.writeUInt32BE(at,0);
  const profile=Buffer.concat([header,table,...pieces]);
  if(profile.length!==2064||profile.toString("ascii",16,20)!=="CMYK")throw Error("ICC profile invalid");
  return profile;
}

function cmykImage() {
  const bytes=Buffer.alloc(SIZE*SIZE*4);
  const swatches=[[255,0,0,0],[0,255,0,0],[0,0,255,0],[0,0,0,255]];
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)
    bytes.set(swatches[(y>=32?2:0)+(x>=32?1:0)],(y*SIZE+x)*4);
  return deflateSync(bytes,{level:9});
}

export function generateAdvancedCodecPdf(kind) {
  if(!["jpx16","icc-cmyk"].includes(kind))throw new RangeError("Unknown advanced codec");
  const jpx=kind==="jpx16";
  const img=jpx?Buffer.from(JPX_16,"base64"):cmykImage();
  const profile=jpx?null:deflateSync(makeTestCmykIccProfile(),{level:9});
  const attrs=jpx?
    "/BitsPerComponent 16 /ColorSpace /DeviceGray /Filter /JPXDecode":
    "/BitsPerComponent 8 /ColorSpace [/ICCBased 8 0 R] /Filter /FlateDecode";
  const chunks=[];const offsets=[0];let length=0;
  const append=v=>{const b=typeof v==="string"?Buffer.from(v,"latin1"):v;chunks.push(b);length+=b.length;};
  const obj=(id,parts)=>{offsets[id]=length;append(id+" 0 obj\n");parts.forEach(append);append("\nendobj\n");};
  append("%PDF-1.7\n%\xB5\xD6\xEA\xCE\n");
  obj(1,["<< /Type /Catalog /Pages 2 0 R >>"]);
  obj(2,["<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>"]);
  for(let id=3;id<=5;id++)obj(id,[
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 64 64] /Resources << /XObject << /Im0 7 0 R >> >> /Contents 6 0 R >>",
  ]);
  const draw=Buffer.from("q 64 0 0 64 0 0 cm /Im0 Do Q\n","ascii");
  obj(6,["<< /Length "+draw.length+" >>\nstream\n",draw,"\nendstream"]);
  obj(7,["<< /Type /XObject /Subtype /Image /Width 64 /Height 64 ",
    attrs," /Length "+img.length+" >>\nstream\n",img,"\nendstream"]);
  if(profile)obj(8,["<< /N 4 /Alternate /DeviceCMYK /Filter /FlateDecode /Length "+
    profile.length+" >>\nstream\n",profile,"\nendstream"]);
  const count=jpx?7:8;const xref=length;
  append("xref\n0 "+(count+1)+"\n0000000000 65535 f \n");
  for(let id=1;id<=count;id++)append(String(offsets[id]).padStart(10,"0")+" 00000 n \n");
  append("trailer\n<< /Size "+(count+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n");
  return Buffer.concat(chunks,length);
}
export function advancedCodecReference(kind,x,y) {
  if(!["jpx16","icc-cmyk"].includes(kind))throw new RangeError("Unknown advanced codec");
  const quadrant=(y>=32?2:0)+(x>=32?1:0);
  const gray=[0,85,170,255][quadrant];
  // Independently verified via LittleCMS 2.19 using this original ICC LUT profile.
  const iccSwatches=[[26,255,255],[255,0,255],[255,255,0],[0,0,0]];
  return kind==="jpx16"?[gray,gray,gray]:iccSwatches[quadrant];
}
export function advancedCodecManifest(kind,bytes){
  return {kind,bytes:bytes.length,pages:3,
    sha256:createHash("sha256").update(bytes).digest("hex"),
    bitsPerComponent:kind==="jpx16"?16:8,
    hasIcc:kind==="icc-cmyk"};
}

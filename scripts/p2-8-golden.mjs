import { createHash } from "node:crypto";

/**
 * Reference raster is assembled independently of PDF or codec decoders.
 * 64x64 full-RGB golden image, not a screenshot from the implementation under test.
 * ICC values independently calculated with LittleCMS 2.19:
 * Pillow ImageCms CMYK -> sRGB for the original CMYK 4->3 channel LUT profile.
 */
const REF_PALETTES=Object.freeze({
  jpx16: [[0,0,0],[85,85,85],[170,170,170],[255,255,255]],
  "icc-cmyk": [[26,255,255],[255,0,255],[255,255,0],[0,0,0]],
});
export const REFERENCE_SIZE=64;
export function referenceRGB(kind) {
  const swatches=REF_PALETTES[kind];
  if(!swatches)throw new RangeError("Unsupported reference kind");
  const buffer=Buffer.alloc(REFERENCE_SIZE*REFERENCE_SIZE*3);
  for(let y=0;y<REFERENCE_SIZE;y++)for(let x=0;x<REFERENCE_SIZE;x++){
    const color=swatches[(y>=32?2:0)+(x>=32?1:0)];
    buffer.set(color,(y*REFERENCE_SIZE+x)*3);
  }
  return buffer;
}
export function referenceInfo(kind) {
  const rgb=referenceRGB(kind);
  return { kind, width:REFERENCE_SIZE,height:REFERENCE_SIZE,
    bytes:rgb.length, sha256:createHash("sha256").update(rgb).digest("hex"),
    provenance:kind==="icc-cmyk"?"original ICC v2 LUT + LittleCMS 2.19 CMYK-to-sRGB":
      "16-bit grayscale values 0,21845,43690,65535 linearly quantized to 8-bit" };
}
/**
 * Per-pixel comparison of EVERY pixel of a native-size 64x64 canvas,
 * 4 channels checked; errors never hidden by a mean/aggregate alone.
 * Color tolerance accommodates cross-platform rounding; alpha must be opaque.
 */
export function compareGoldenRgba(kind, actual, width, height, { tolerance=12 }={}) {
  if(width!==REFERENCE_SIZE||height!==REFERENCE_SIZE)
    throw new RangeError("Expected 64x64 native canvas at 100% zoom and DPR 1");
  if(!actual || actual.length!==width*height*4)
    throw new RangeError("Expected complete RGBA 64x64 canvas");
  if(!Number.isSafeInteger(tolerance)||tolerance<0||tolerance>20)
    throw new RangeError("Invalid pixel tolerance");
  const expected=referenceRGB(kind);
  let mismatched=0, maxError=0, sumError=0, alphaFailures=0;
  const samples=[];
  for(let p=0;p<width*height;p++){
    let difference=0;
    for(let ch=0;ch<3;ch++){
      const d=Math.abs(actual[p*4+ch]-expected[p*3+ch]);
      maxError=Math.max(maxError,d);sumError+=d;
      difference=Math.max(difference,d);
    }
    if(actual[p*4+3]!==255){alphaFailures++;difference=255;}
    if(difference>tolerance){
      mismatched++;
      if(samples.length<6)samples.push({
        x:p%width,y:Math.floor(p/width),actual:Array.from(actual.slice(p*4,p*4+4)),
        expected:Array.from(expected.slice(p*3,p*3+3)),
      });
    }
  }
  return {kind,totalPixels:width*height,comparedRgbChannels:width*height*3,
    mismatchedPixels:mismatched,alphaFailures,maxChannelError:maxError,
    meanAbsoluteChannelError:Number((sumError/(width*height*3)).toFixed(5)),
    tolerance,samples,referenceSha256:referenceInfo(kind).sha256,pass:mismatched===0};
}

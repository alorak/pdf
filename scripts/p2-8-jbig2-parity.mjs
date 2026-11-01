import { createHash } from "node:crypto";

/**
 * Strictly parse raw P6/P5 Poppler output, not a PNG requiring an additional
 * image decoder. Never allow arbitrary PDF files or PPM images in artifacts.
 */
export function parsePortablePixmap(bytes) {
  const source=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  let pos=0;
  const tokens=[];
  while(tokens.length<4) {
    while(pos<source.length && [9,10,13,32].includes(source[pos])) pos++;
    if(source[pos]===35) {
      while(pos<source.length && source[pos]!==10) pos++;
      continue;
    }
    const begin=pos;
    while(pos<source.length && ![9,10,13,32].includes(source[pos])) pos++;
    if(pos===begin || pos>=source.length) throw new Error("Malformed PNM header");
    tokens.push(source.toString("ascii",begin,pos));
  }
  if(!["P6","P5"].includes(tokens[0])) throw new Error("Only binary P6/P5 references supported");
  const width=Number(tokens[1]),height=Number(tokens[2]),max=Number(tokens[3]);
  if(!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
     width<1 || height<1 || width*height>4_000_000 || max!==255)
    throw new Error("Invalid PNM dimensions or depth");
  if(![9,10,13,32].includes(source[pos])) throw Error("Missing PNM data delimiter");
  pos++;
  const bpp=tokens[0]==="P6"?3:1;
  const expected=width*height*bpp;
  if(source.length-pos!==expected) throw new Error("PNM data payload length mismatch");
  const raw=source.subarray(pos);
  const rgb=Buffer.alloc(width*height*3);
  if(bpp===3) raw.copy(rgb);
  else for(let i=0;i<raw.length;i++)rgb.fill(raw[i],i*3,i*3+3);
  return {width,height,rgb,sha256:createHash("sha256").update(rgb).digest("hex")};
}

/**
 * Same page raster is sampled on a deterministic normalized grid.
 * Compare Poppler and Chromium independent renderers in sRGB8 at 32x32
 * centers; no OCR, image matching ML, or per-source tuning.
 */
export function compareBinaryPageReference(actualPixels,actualWidth,actualHeight,
    poppler,width,height,grid=32) {
  if(!Number.isSafeInteger(grid) || grid<8 || grid>128)throw RangeError("Invalid grid");
  if(actualPixels.length!==actualWidth*actualHeight*4 ||
     poppler.length!==width*height*3)throw Error("Invalid pixel geometry");
  let tp=0,fp=0,fn=0,tn=0,absolute=0;
  for(let y=0;y<grid;y++) for(let x=0;x<grid;x++) {
    const nx=(x+.5)/grid,ny=(y+.5)/grid;
    const ax=Math.min(actualWidth-1,Math.floor(nx*actualWidth));
    const ay=Math.min(actualHeight-1,Math.floor(ny*actualHeight));
    const rx=Math.min(width-1,Math.floor(nx*width));
    const ry=Math.min(height-1,Math.floor(ny*height));
    const ac=(ay*actualWidth+ax)*4,rc=(ry*width+rx)*3;
    const a=(actualPixels[ac]+actualPixels[ac+1]+actualPixels[ac+2])/3;
    const r=(poppler[rc]+poppler[rc+1]+poppler[rc+2])/3;
    absolute+=Math.abs(a-r);
    if(r<128) {if(a<128)tp++;else fn++;}
    else {if(a<128)fp++;else tn++;}
  }
  const total=grid*grid,precision=tp+fp?tp/(tp+fp):0,recall=tp+fn?tp/(tp+fn):0;
  return { grid,comparedPixels:total,mae:Math.round(absolute/total*1e3)/1e3,
    referenceInkPixels:tp+fn,actualInkPixels:tp+fp,
    truePositive:tp,falsePositive:fp,falseNegative:fn,trueNegative:tn,
    precision:Number(precision.toFixed(4)),recall:Number(recall.toFixed(4)),
    f1:Number((precision+recall?2*precision*recall/(precision+recall):0).toFixed(4)),
    geometry:{browser:[actualWidth,actualHeight],poppler:[width,height]},
  };
}


/** Compare EVERY pixel against Poppler, with exact 1:1 geometry. */
export function compareEveryBinaryPixel(actual,actualWidth,actualHeight,reference,width,height){
  if(actualWidth!==width||actualHeight!==height)
    throw new Error("Full-pixel comparison requires identical PDF raster geometry");
  if(actual.length!==width*height*4||reference.length!==width*height*3)
    throw new Error("Invalid source and reference buffer stride");
  const count=width*height;
  if(!Number.isSafeInteger(count)||count<1||count>4_000_000)
    throw new RangeError("Out-of-range pixel count");
  let tp=0,fp=0,fn=0,tn=0,sum=0,alphaErrors=0;
  for(let p=0;p<count;p++){
    const a=p*4,r=p*3;
    const av=(actual[a]+actual[a+1]+actual[a+2])/3;
    const rv=(reference[r]+reference[r+1]+reference[r+2])/3;
    sum+=Math.abs(av-rv);
    if(actual[a+3]!==255)alphaErrors++;
    if(rv<128){
      if(av<128)tp++;else fn++;
    }else{
      if(av<128)fp++;else tn++;
    }
  }
  const precision=tp+fp?tp/(tp+fp):0;
  const recall=tp+fn?tp/(tp+fn):0;
  return { comparedPixels:count, channelsCompared:count*3, width,height,
    mae:Number((sum/count).toFixed(4)),
    alphaErrors, truePositive:tp,falsePositive:fp,falseNegative:fn,trueNegative:tn,
    referenceInkPixels:tp+fn, actualInkPixels:tp+fp,
    precision:Number(precision.toFixed(4)),recall:Number(recall.toFixed(4)),
    f1:Number((precision+recall?2*precision*recall/(precision+recall):0).toFixed(4)),
    referenceSha256:createHash("sha256").update(reference).digest("hex"),
  };
}

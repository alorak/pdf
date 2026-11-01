import { createHash } from "node:crypto";

/** Compare every source-resolution pixel in sRGB8, not just an image palette. */
export function compareReferencePixels(actualRgba, expectedRgb, width, height, {
  channelThreshold = 4,
} = {}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width * height > 4_000_000) {
    throw new RangeError("Invalid reference dimensions");
  }
  if (!Number.isFinite(channelThreshold) || channelThreshold < 0 || channelThreshold > 255) {
    throw new RangeError("Invalid channel tolerance");
  }
  const size = width * height;
  if (actualRgba.length !== size * 4 || expectedRgb.length !== size * 3) {
    throw new Error("Pixel geometry/stride mismatch; comparison must be 1:1");
  }
  let abs = 0;
  let sq = 0;
  let max = 0;
  let differingPixels = 0;
  let alphaErrors = 0;
  let overThresholdChannels = 0;
  const worst = [];
  for (let p = 0; p < size; p++) {
    const ac = p * 4, ex = p * 3;
    let worstPixel = 0;
    for (let ch = 0; ch < 3; ch++) {
      const delta = Math.abs(actualRgba[ac + ch] - expectedRgb[ex + ch]);
      abs += delta; sq += delta * delta;
      if (delta > max) max = delta;
      if (delta > worstPixel) worstPixel = delta;
      if (delta > channelThreshold) overThresholdChannels++;
    }
    if (actualRgba[ac + 3] !== 255) alphaErrors++;
    if (worstPixel > channelThreshold) {
      differingPixels++;
      worst.push({ x: p % width, y: Math.floor(p / width),
        maximumChannelError: worstPixel });
    }
  }
  worst.sort((a,b) => b.maximumChannelError - a.maximumChannelError);
  return {
    width, height, comparedPixels: size,
    mae: Number((abs / (size * 3)).toFixed(4)),
    rmse: Number(Math.sqrt(sq / (size * 3)).toFixed(4)),
    maxChannelError: max,
    differingPixels, differingPixelPercent: Number((100 * differingPixels / size).toFixed(3)),
    overThresholdChannels, alphaErrors,
    worst: worst.slice(0, 6),
    referenceSha256: createHash("sha256").update(expectedRgb).digest("hex"),
  };
}

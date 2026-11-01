import { readFile, writeFile, realpath } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { createHash } from "node:crypto";
import { buildP29Pdf } from "./p2-9-fixtures.mjs";

const [profilePath, pdfPath] = process.argv.slice(2);
const root="/tmp/p29-print";
if(!profilePath || !pdfPath || !resolve(profilePath).startsWith(root+sep) ||
   !resolve(pdfPath).startsWith(root+sep))
  throw new Error("Only temporary P2.9 profile test paths allowed");
const input=await realpath(profilePath);
if(!input.startsWith(root+sep))throw new Error("Profile symlink outside trusted test directory");
const profile=await readFile(input);
if(profile.length>16*1024*1024 || profile.length<1024 ||
  profile.toString("ascii",36,40)!=="acsp" ||
  profile.toString("ascii",16,20)!=="CMYK")
  throw new Error("Not a verified CMYK ICC profile");
const pdf=buildP29Pdf({kind:"external-cmyk",profile});
await writeFile(pdfPath,pdf,{flag:"wx"});
console.log("P2_9_TEMP_PRINT_PDF "+JSON.stringify({
  bytes:pdf.length,sha256:createHash("sha256").update(pdf).digest("hex"),
  rawIccEmbeddedOnlyInEphemeralPdf:true}));

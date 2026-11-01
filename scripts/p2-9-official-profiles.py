#!/usr/bin/env python3
"""P2.9 ephemeral official ICC Registry profiles + LittleCMS reference rasters.

Never commit, upload, change or redistribute ICC file bytes.
Discovery mode prints SHA-256 but explicitly is NOT an accepted test run.
"""
from __future__ import annotations

import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

from PIL import Image, ImageCms

ROOT = Path("/tmp/p29-print")
REGISTRY = "https://registry.color.org/profile-registry/profiles/"
# SHA pins are populated after first license-reviewed discovery CI.
PINNED_SHA256 = {
    "fogra51": "c30ad2c01e8f93135ec7682c535e0a81bc2d177c301e196376c5f5838b5c8e86",
    "swop2006": "27dc90dbeb399b76c0f91a6b387fe30c38939f034d2500712f3c43094be15e3b",
}
PROFILES = {
    "fogra51": ("PSOcoated_v3.icc", "ECI/Heidelberg", "FOGRA51"),
    "swop2006": ("SWOP2006_Coated3v2.icc", "Idealliance/X-Rite", "CGATS TR003"),
}

def original_cmyk_image() -> Image.Image:
    raw = bytearray(64*64*4)
    patches = ((255,0,0,0),(0,255,0,0),(0,0,255,0),(0,0,0,255))
    for y in range(64):
        for x in range(64):
            offset = 4 * (y*64+x)
            raw[offset:offset+4] = bytes(patches[(y>=32)*2+(x>=32)])
    return Image.frombytes("CMYK",(64,64),bytes(raw))

def fetch_profile(filename: str) -> bytes:
    url = REGISTRY + filename
    req = urllib.request.Request(url, headers={"User-Agent": "PDF-viewer-P2.9-research/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        parsed = urllib.parse.urlparse(resp.geturl())
        if parsed.scheme != "https" or parsed.netloc != "registry.color.org" or not parsed.path.startswith("/profile-registry/profiles/"):
            raise ValueError("Unexpected profile download redirect")
        raw = resp.read(16*1024*1024+1)
        if resp.status != 200 or not 1024 <= len(raw) <= 16*1024*1024:
            raise ValueError("Unexpected ICC status or size")
        return raw

def check_icc(blob: bytes, case: str) -> dict:
    if len(blob) < 128 or int.from_bytes(blob[0:4],"big") > len(blob):
        raise ValueError("Invalid ICC length/header: "+case)
    if blob[36:40] != b"acsp" or blob[16:20] != b"CMYK":
        raise ValueError("Not ICC CMYK: "+case)
    if blob[12:16] not in (b"prtr",b"spac"):
        raise ValueError("Unexpected device profile class: "+case)
    major=blob[8]
    if major not in (2,4): raise ValueError("Unrecognized ICC version")
    return {"size":len(blob),"iccMajor":major,
        "deviceClass":blob[12:16].decode("ascii"),
        "space":blob[16:20].decode("ascii")}

def main() -> None:
    ROOT.mkdir(parents=True,exist_ok=True)
    discovery = os.environ.get("P2_9_PROFILE_DISCOVERY") == "1"
    entries=[]
    for case, (filename, owner, standard) in PROFILES.items():
        blob=fetch_profile(filename)
        header=check_icc(blob,case)
        sha=hashlib.sha256(blob).hexdigest()
        print("P2_9_OFFICIAL_PROFILE_ID "+json.dumps({
            "case":case,"sha256":sha,"provider":owner,"standard":standard,**header}))
        expected=PINNED_SHA256[case]
        if not discovery and (not expected or expected != sha):
            raise ValueError("Official ICC SHA-256 pin missing or mismatched: "+case)
        if discovery:
            continue
        profile_path=ROOT/filename
        profile_path.write_bytes(blob)
        rgb_profile=ImageCms.createProfile("sRGB")
        source_profile=ImageCms.ImageCmsProfile(BytesIO(blob))
        transform=ImageCms.buildTransformFromOpenProfiles(source_profile,
            rgb_profile, "CMYK", "RGB",renderingIntent=0)
        actual_ref=ImageCms.applyTransform(original_cmyk_image(),transform)
        pixels=actual_ref.tobytes()
        if len(pixels)!=64*64*3: raise ValueError("Unexpected reference raster size")
        ref_path=ROOT/(case+".rgb")
        ref_path.write_bytes(pixels)
        pdf_path=ROOT/(case+".pdf")
        subprocess.run(["node","scripts/p2-9-build-print-pdf.mjs",
            str(profile_path),str(pdf_path)],check=True,timeout=30)
        pdf=pdf_path.read_bytes()
        if not pdf.startswith(b"%PDF-") or len(pdf)<len(blob):
            raise ValueError("Incorrect PDF generated")
        entries.append({"id":case,"pdfPath":str(pdf_path),"referencePath":str(ref_path),
            "sha256":hashlib.sha256(pdf).hexdigest(),
            "profileSha256":sha,"referenceSha256":hashlib.sha256(pixels).hexdigest(),
            "iccMajor":header["iccMajor"],"provider":owner,"standard":standard})
    if discovery:
        print("P2_9_DISCOVERY_ONLY "+json.dumps({
            "discovered":len(PROFILES),"accepted":False,
            "reason":"SHA256 pins must be reviewed and committed before acceptance"}))
        return
    if len(entries)!=2: raise ValueError("Expected FOGRA51 and SWOP2006 profiles")
    with open(os.environ["GITHUB_ENV"],"a",encoding="utf8") as env:
        env.write("P2_9_PRINT_FILES="+json.dumps(entries,separators=(",",":"))+"\n")
    print("P2_9_PRINT_INPUTS_READY "+json.dumps({"cases":len(entries),
        "referenceEngine":"Pillow ImageCms / LittleCMS2",
        "rawProfileBytesArchived":False}))

if __name__=="__main__":
    main()

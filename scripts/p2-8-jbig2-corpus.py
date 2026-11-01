#!/usr/bin/env python3
"""Fetch fixed-revision, licensed JBIG2 PDF wrappers; create independent Poppler P6 raster.

Sources: Nico Weber's JBIG2 tests used by Mozilla PDF.js; licence BSD-2-Clause
as documented in the P2.7 codec acceptance and upstream SerenityOS suite.
No external PDF or reference image is ever checked in or uploaded to artifacts.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path("/tmp/p28-jbig2")
COMMIT = "0a4153349dc473ba950fc17941c5ca7eda43c1de"
CASES = [
    ("jbig2-symbol-refine", "bitmap-symbol-refine.pdf", "63b28e84e0f79abec688c981d24be91065ac0edf"),
    ("jbig2-stripe", "bitmap-stripe.pdf", "0f43af5cfe59aaeec45c2881b893adae658eb111"),
    ("jbig2-symbol-huffman", "bitmap-symbol-symhuff-texthuff.pdf", "38c66341b295edaf575fcadd0d58ad7de0ed14b0"),
    ("jbig2-halftone-10bpp", "bitmap-halftone-10bpp.pdf", "68daf4bb6e7619dae9a919b4b838dca5603dbb6a"),
]
# Phase 1 discovers SHA-256 under pinned Git blob integrity; phase 2 locks both.
EXPECTED_SHA256 = {
    # Filled using the CI evidence after verifying exact upstream Git blobs.
}

def execute(*args: str) -> None:
    subprocess.run(args, check=True, timeout=120)

def main() -> None:
    ROOT.mkdir(parents=True,exist_ok=True)
    cases = []
    for ident, filename, git_blob in CASES:
        dest = ROOT / filename
        url = f"https://raw.githubusercontent.com/mozilla/pdf.js/{COMMIT}/test/pdfs/{filename}"
        execute("curl","--fail","--location","--retry","3","--connect-timeout","20",
                "--max-time","90","--silent","--show-error","--output",str(dest),url)
        data=dest.read_bytes()
        if not 300<=len(data)<=100_000 or not data.startswith(b"%PDF-") or b"/JBIG2Decode" not in data:
            raise ValueError(f"Not a valid pinned JBIG2 PDF: {ident}")
        blob = subprocess.check_output(["git","hash-object",str(dest)],text=True).strip()
        if blob != git_blob:
            raise ValueError(f"Unexpected upstream Git blob for {ident}: {blob}")
        sha256=hashlib.sha256(data).hexdigest()
        if EXPECTED_SHA256 and sha256 != EXPECTED_SHA256.get(ident):
            raise ValueError(f"Pinned SHA-256 mismatch: {ident}")
        stem=ROOT / ident
        execute("pdftoppm","-f","1","-l","1","-r","72","-singlefile",
                str(dest),str(stem))
        ppm=stem.with_suffix(".ppm")
        if not ppm.exists() or not ppm.read_bytes().startswith(b"P6"):
            raise ValueError(f"Expected independent Poppler P6 raster: {ident}")
        record=dict(id=ident,pdfPath=str(dest),ppmPath=str(ppm),
                    gitBlob=git_blob,sha256=sha256)
        print("P2_8_JBIG2_PINNED_SOURCE "+json.dumps(
            {k:record[k] for k in ("id","gitBlob","sha256")}|{"pdfBytes":len(data)}))
        cases.append(record)
    with open(os.environ["GITHUB_ENV"],"a",encoding="utf8") as f:
        f.write("P2_8_JBIG2_FILES="+json.dumps(cases,separators=(",",":"))+"\n")
    print("P2_8_JBIG2_INPUTS_READY "+json.dumps({"count":len(cases),"poppler":True}))

if __name__=="__main__":main()

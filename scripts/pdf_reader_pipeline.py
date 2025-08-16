#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pdf_reader_pipeline.py
- Robust --pages parser: supports 1,3,1-4, last, last-1, 2-last, last-3-last, 전체, all, and mixes like "1-2,last-1,last"
- Default output: ONLY one full text file (UTF-8) at <outdir>/full_text.txt
- Outdir default: <input_pdf_basename_without_extension>/  (e.g., /path/paper.pdf -> /path/paper/)
- Optional: emit page PNGs and per-page TXT via flags
- Strict: invalid page spec or out-of-range page → ValueError (NO fallback to full)
"""

# --- PyMuPDF sanity guard ---
try:
    import fitz  # should be PyMuPDF (module name 'fitz')
    _doc = (getattr(fitz, "__doc__", "") or "")
    if not hasattr(fitz, "open") or ("PyMuPDF" not in _doc and "MuPDF" not in _doc):
        raise ImportError("wrong_fitz")
except Exception:
    import pymupdf as _pymupdf
    import sys as _sys
    _sys.modules["fitz"] = _pymupdf
    import fitz
# --------------------------------

import argparse
import io
import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional

from PIL import Image

try:
    import pytesseract
    TESS_AVAILABLE = True
except Exception:
    TESS_AVAILABLE = False


# ==========================
# Page parsing: strict + robust
# ==========================
_RANGE_RE  = re.compile(r'^\s*(last(?:-\d+)?|\d+)\s*-\s*(last(?:-\d+)?|\d+)\s*$')
_SINGLE_RE = re.compile(r'^\s*(last(?:-\d+)?|\d+|all)\s*$')
# Unicode dash → ASCII '-' : ‐ - ‒ – — ― −
_DASHES    = dict.fromkeys(map(ord, "\u2010\u2011\u2012\u2013\u2014\u2015\u2212"), "-")

def _parse_one_token(tok: str, total_pages: int) -> int:
    """
    Single token to 0-index page number.
    -2 → all
    Invalid → ValueError.
    """
    t = tok.strip().lower()
    if t == "all":
        return -2
    if t == "last":
        return total_pages - 1
    if t.startswith("last-"):
        off_str = t.split("-", 1)[1]
        if not off_str.isdigit():
            raise ValueError(f"Invalid last-offset: {tok}")
        idx = total_pages - 1 - int(off_str)
        if not (0 <= idx < total_pages):
            raise ValueError(f"Page out of range: {tok}")
        return idx
    if t.isdigit():
        p = int(t)
        if not (1 <= p <= total_pages):
            raise ValueError(f"Page out of range: {tok}")
        return p - 1
    raise ValueError(f"Invalid token: {tok}")

def _parse_endpoint(val: str, total_pages: int) -> int:
    """
    Endpoint to 1-index page number.
    Invalid → ValueError.
    """
    t = val.strip().lower()
    if t in ("all", "last"):
        return total_pages
    if t.startswith("last-"):
        off_str = t.split("-", 1)[1]
        if not off_str.isdigit():
            raise ValueError(f"Invalid last-offset: {val}")
        res = total_pages - int(off_str)  # 1-index
        if not (1 <= res <= total_pages):
            raise ValueError(f"Endpoint out of range: {val}")
        return res
    if t.isdigit():
        res = int(t)
        if not (1 <= res <= total_pages):
            raise ValueError(f"Endpoint out of range: {val}")
        return res
    raise ValueError(f"Invalid endpoint: {val}")

def parse_pages_arg(pages_arg: str, total_pages: int):
    """
    Parse pages arg.
    """
    if not pages_arg:
        return None

    raw_arg = pages_arg.translate(_DASHES)
    wanted = []
    any_tok = False

    for raw in raw_arg.split(","):
        tok = raw.strip()
        if not tok:
            continue
        any_tok = True
        tok_l = tok.lower()

        # 1) Single(fullmatch)
        if _SINGLE_RE.fullmatch(tok_l):
            idx = _parse_one_token(tok, total_pages)
            if idx == -2:  # All
                wanted.extend(range(total_pages))
            else:
                wanted.append(idx)
            continue

        # 2) Range(fullmatch)
        m = _RANGE_RE.fullmatch(tok_l)
        if m:
            a_str, b_str = m.group(1), m.group(2)
            a = _parse_endpoint(a_str, total_pages)  # 1-index
            b = _parse_endpoint(b_str, total_pages)  # 1-index
            if a > b:
                a, b = b, a
            wanted.extend(range(a - 1, b))
            continue

        # 3) Invalid token
        raise ValueError(f"Invalid token: {tok}")

    if not any_tok:
        raise ValueError(f"Invalid --pages spec (empty after parsing): {pages_arg}")

    res = sorted(set(wanted))
    if not res:
        raise ValueError(f"Invalid --pages spec (no valid pages): {pages_arg}")
    return res


# ==========================
# PDF→Text pipeline
# ==========================
@dataclass
class PDFInspector:
    pdf_path: Path
    zoom: float = 2.0                 # OCR render zoom (2.0≈144dpi)
    ocr_if_scanned: bool = True
    ocr_lang: str = "eng"
    text_per_page: List[str] = field(default_factory=list)

    def _extract_text_basic(self, page: "fitz.Page") -> str:
        return page.get_text("text") or ""

    @staticmethod
    def _is_scanned(txt: str) -> bool:
        stripped = "".join(ch for ch in txt if not ch.isspace())
        return len(stripped) < 20

    def _ocr_page(self, page: "fitz.Page") -> str:
        if not TESS_AVAILABLE:
            return ""
        mat = fitz.Matrix(self.zoom, self.zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_bytes = pix.tobytes("png")
        with Image.open(io.BytesIO(img_bytes)) as im:
            return pytesseract.image_to_string(im, lang=self.ocr_lang) or ""

    def extract_full_text(self, selected_pages: Optional[List[int]] = None) -> str:
        self.text_per_page.clear()
        with fitz.open(self.pdf_path.as_posix()) as doc:
            indices = list(range(doc.page_count)) if selected_pages is None else selected_pages
            for i in indices:
                p = doc.load_page(i)
                txt = self._extract_text_basic(p)
                if self._is_scanned(txt) and self.ocr_if_scanned:
                    ocr_txt = self._ocr_page(p)
                    if len(ocr_txt.strip()) > len(txt.strip()):
                        txt = ocr_txt
                self.text_per_page.append(txt)
        return "\n\n".join(self.text_per_page)

    def render_pages(self, selected_pages: List[int], outdir: Path, dpi: int = 180, max_w: int = 1600):
        """Render pages to PNGs when needed (default off)."""
        outdir.mkdir(parents=True, exist_ok=True)
        with fitz.open(self.pdf_path.as_posix()) as doc:
            for i in selected_pages:
                page = doc.load_page(i)
                zoom = dpi / 72
                mat = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                if pix.width > max_w:
                    scale = max_w / pix.width
                    mat2 = fitz.Matrix(scale, scale)
                    pix = page.get_pixmap(matrix=mat @ mat2, alpha=False)
                (outdir / f"page_{i+1:04d}.png").write_bytes(pix.tobytes("png"))

    def write_per_page_txt(self, selected_pages: List[int], outdir: Path):
        """Write per-page TXT when needed (default off)."""
        outdir.mkdir(parents=True, exist_ok=True)
        for idx, txt in zip(selected_pages, self.text_per_page):
            (outdir / f"page_{idx+1:04d}.txt").write_text(txt, encoding="utf-8")


# ==========================
# CLI
# ==========================
def main():
    ap = argparse.ArgumentParser(description="PDF → Full text (with robust --pages).")
    ap.add_argument("pdf", type=str, help="Path to local PDF")
    ap.add_argument("--pages", type=str, default=None,
                    help='e.g., "1-2,last-1,last", "2-last", "last-2-last", "전체"')
    ap.add_argument("--out", type=str, default=None,
                    help="Output directory (default: <pdf without .pdf>)")
    ap.add_argument("--zoom", type=float, default=2.0, help="OCR render zoom (default 2.0)")
    ap.add_argument("--no-ocr", action="store_true", help="Disable OCR fallback for scanned pages")
    ap.add_argument("--ocr-lang", type=str, default="eng", help="Tesseract language code, e.g., eng, kor, jpn")

    # Options: default off
    ap.add_argument("--emit-pages", action="store_true", help="Also save selected pages as PNG images")
    ap.add_argument("--emit-per-page-txt", action="store_true", help="Also save per-page text files")

    args = ap.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    # outdir default: <pdf without .pdf>/
    outdir = Path(args.out) if args.out else pdf_path.parent
    outdir.mkdir(parents=True, exist_ok=True)

    # Total pages
    with fitz.open(pdf_path.as_posix()) as doc:
        total_pages = doc.page_count

    # Page parsing (strict: fail on invalid)
    if args.pages:
        selected_pages = parse_pages_arg(args.pages, total_pages)
    else:
        selected_pages = None  # None = all

    inspector = PDFInspector(
        pdf_path=pdf_path,
        zoom=args.zoom,
        ocr_if_scanned=not args.no_ocr,
        ocr_lang=args.ocr_lang
    )

    full_text = inspector.extract_full_text(selected_pages)

    # Default output: full_text.txt only
    (outdir / (pdf_path.stem + ".txt")).write_text(full_text, encoding="utf-8")

    # Option output
    if args.emit_pages and selected_pages is not None:
        inspector.render_pages(selected_pages, outdir / "pages")

    if args.emit_per_page_txt and selected_pages is not None:
        # extract_full_text has been called already, so text_per_page is filled
        inspector.write_per_page_txt(selected_pages, outdir / "text")


if __name__ == "__main__":
    main()

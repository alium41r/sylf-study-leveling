"""Independent PDF structure/text/Poppler pixel checks on owned browser exports."""
import argparse
import hashlib
import os
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageChops
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument("--pdftoppm", default="pdftoppm")
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
fixtures = Path(__file__).parent / "fixtures"
evidence = Path(os.environ["NOTES_QA_EVIDENCE"]) if os.environ.get("NOTES_QA_EVIDENCE") else root / "documentation/notes/reports/phase-5/evidence"
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
before = {p.name: sha(p) for p in fixtures.glob("*.pdf")}
original = PdfReader(fixtures / "lecture.pdf")
study = PdfReader(evidence / "annotated-study-copy.pdf")
rotated = PdfReader(evidence / "rotated-study-copy.pdf")
assert len(original.pages) == len(study.pages) == len(rotated.pages) == 3
for i, page in enumerate(study.pages):
    assert page.extract_text() == original.pages[i].extract_text()
    assert list(page.cropbox) == list(original.pages[i].cropbox)
    assert page.get("/UserUnit", 1) == original.pages[i].get("/UserUnit", 1)
    assert page.rotation == original.pages[i].rotation
assert rotated.pages[1].rotation == 180
assert list(rotated.pages[1].cropbox) == [40, 60, 360, 540]
assert rotated.pages[1].get("/UserUnit") == 2

def render(path, page, label, dpi=144):
    prefix = evidence / label
    subprocess.run([args.pdftoppm, "-png", "-singlefile", "-cropbox", "-r", str(dpi),
                    "-f", str(page), "-l", str(page), str(path), str(prefix)], check=True)
    return Image.open(str(prefix) + ".png").convert("RGB")

source1 = render(fixtures / "lecture.pdf", 1, "export-source-page-1")
copy1 = render(evidence / "annotated-study-copy.pdf", 1, "export-study-page-1")
assert source1.size == copy1.size == (1200, 1600)
assert ImageChops.difference(source1.crop((0, 0, 1200, 155)), copy1.crop((0, 0, 1200, 155))).getbbox() is None
source2 = render(fixtures / "lecture.pdf", 2, "export-source-page-2")
copy2 = render(evidence / "annotated-study-copy.pdf", 2, "export-study-page-2")
assert ImageChops.difference(source2, copy2).getbbox() is None
rotated2 = render(evidence / "rotated-study-copy.pdf", 2, "export-rotated-page-2")
assert rotated2.size == (640, 960)
mask = Image.new("1", rotated2.size)
mask.putdata([b > 220 and r < 40 and 45 < g < 110 for r, g, b in rotated2.getdata()])
assert mask.getbbox() == (430, 80, 520, 140)
# First authored canonical point (90,150), rotated an additional quarter-turn,
# must meet the immutable source marker at displayed (490,90).
assert any(max(pixel) < 100 for pixel in rotated2.crop((484, 84, 498, 99)).getdata())
assert sum(1 for r, g, b in copy1.crop((95, 170, 880, 210)).getdata() if r > 200 and g > 180 and b < 225) > 10_000

large_source = fixtures / "large-300.pdf"
large_copy = evidence / "large-300-study-copy.pdf"
large = PdfReader(large_copy)
assert len(large.pages) == 300
assert "photosynthesis" in large.pages[199].extract_text()
assert large_copy.stat().st_size < large_source.stat().st_size * 1.5 + 300_000
image_refs = set()
for page in large.pages:
    objects = page["/Resources"].get("/XObject", {})
    for ref in objects.values():
        obj = ref.get_object()
        if obj.get("/Subtype") == "/Image":
            image_refs.add((ref.idnum, ref.generation))
assert len(image_refs) == 1, "Repeated source image must stay shared across pages."
for number in [1, 200, 300]:
    a = render(large_source, number, f"large-original-{number}", 72)
    b = render(large_copy, number, f"large-study-{number}", 72)
    assert a.size == b.size and ImageChops.difference(a, b).getbbox() is None
assert before == {p.name: sha(p) for p in fixtures.glob("*.pdf")}
result = {"passed": True, "sourceFilesUnchanged": before, "studyPages": 3,
          "originalTextCropAndUserUnitPreserved": True, "unannotatedSourcePagePixelExact": True,
          "rotatedBlueMarkerBounds": list(mask.getbbox()), "rotatedInkAtSourceMarker": True,
          "largePages": 300, "largeRepeatedImageObjects": len(image_refs), "largePixelExactPages": [1, 200, 300],
          "largeCopyBytes": large_copy.stat().st_size,
          "scope": "Synthetic PDFs; independent pypdf/Poppler verification plus visual inspection. Not all fonts, forms or signatures."}
(evidence / "export-fidelity-results.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result))

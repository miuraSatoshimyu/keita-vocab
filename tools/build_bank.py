"""bank_source.txt -> data/bank.json

使い方(リポジトリ直下で): python3 tools/build_bank.py
週1の補充タスクは bank_source.txt の末尾に行を足してからこれを実行する。
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "bank_source.txt"
OUT = ROOT / "data" / "bank.json"
TAGS = {"dx": "製造業DX", "ai": "AI・データ", "mg": "マネジメント", "co": "コーチング", "rb": "ロボット", "tc": "TOEIC頻出"}


def parse(text: str) -> list[dict]:
    words, seen = [], set()
    for n, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        if len(parts) != 8:
            raise ValueError(f"line {n}: 8 fields expected, got {len(parts)}: {line}")
        w, ipa, pos, ja, ex, exja, col, tag = (p.strip() for p in parts)
        key = w.lower()
        if key in seen:
            raise ValueError(f"line {n}: duplicate word '{w}'")
        if tag not in TAGS:
            raise ValueError(f"line {n}: unknown tag '{tag}'")
        seen.add(key)
        words.append({
            "id": key.replace(" ", "-"),
            "w": w, "ipa": ipa, "pos": pos, "ja": ja,
            "ex": ex, "exja": exja,
            "col": [c.strip() for c in col.split(";") if c.strip()],
            "tag": tag,
        })
    return words


def main() -> int:
    words = parse(SRC.read_text(encoding="utf-8"))
    OUT.write_text(json.dumps({"version": 2, "tags": TAGS, "words": words}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"bank.json: {len(words)} words")
    return 0


if __name__ == "__main__":
    sys.exit(main())

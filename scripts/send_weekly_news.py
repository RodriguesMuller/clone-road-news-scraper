#!/usr/bin/env python3
import json
from pathlib import Path
import sys

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from scraper.weekly_news import build_and_send_weekly_news

load_dotenv(encoding="utf-8-sig")


def main() -> int:
    result = build_and_send_weekly_news(days=7)
    print(json.dumps(result["delivery"], ensure_ascii=False, indent=2))
    print("\nResumo executivo:")
    print(result["summary"].get("executive_summary", ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())

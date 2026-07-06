#!/usr/bin/env python3
import json
import sys

from dotenv import load_dotenv

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

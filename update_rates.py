#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日匯率：抓「臺灣銀行牌告匯率」(https://rate.bot.com.tw/xrt) → data/rates.json
- 該站對一般 curl 會出驗證頁，故用無頭 Chrome(playwright) 取頁面，再用 data-table 欄位解析（不編造數字）
- 幣別：USD 美金、AUD 澳幣、JPY 日圓、EUR 歐元、CNY 人民幣；欄位：現金買入/賣出、即期買入/賣出
- 抓取或驗證失敗 → 不覆蓋舊檔，結束碼 1
用法：update_rates.py [--push]   （--push：有變更才 git commit + push）
"""
import sys, os, re, json, subprocess, time
from datetime import datetime, timezone, timedelta

REPO = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(REPO, "data", "rates.json")
URL = "https://rate.bot.com.tw/xrt?Lang=zh-TW"
WANT = [("USD", "美元", "美金"), ("AUD", "澳幣", "澳幣"), ("JPY", "日圓", "日圓"), ("EUR", "歐元", "歐元"), ("CNY", "人民幣", "人民幣")]
TPE = timezone(timedelta(hours=8))

def fetch_html():
    from playwright.sync_api import sync_playwright
    exe = "/usr/bin/google-chrome"
    last = None
    for n in range(3):
        try:
            with sync_playwright() as p:
                kw = {"args": ["--no-sandbox"], "headless": True}
                if os.path.exists(exe): kw["executable_path"] = exe
                b = p.chromium.launch(**kw)
                pg = b.new_page(user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
                pg.goto(URL, wait_until="networkidle", timeout=60000)
                pg.wait_for_timeout(6000)
                html = pg.content(); b.close()
            if "掛牌時間" in html and "data-table" in html: return html
            last = "頁面不含牌告表格（可能被驗證頁擋住）"
        except Exception as e:
            last = repr(e)
        time.sleep(5)
    raise RuntimeError(last)

def num(s):
    s = re.sub(r"\s+", "", s)
    try: return float(s)
    except ValueError: return None

def parse(html):
    m = re.search(r'牌價最新掛牌時間：<span class="time">([\d/ :]+)</span>', html)
    if not m: raise RuntimeError("找不到掛牌時間")
    listed = m.group(1).strip()
    rows = re.findall(r"<tr>(.*?)</tr>", html, re.S)
    cur = []
    for code, zh, bot_name in WANT:
        row = next((r for r in rows if f"({code})" in r and 'data-table="本行即期買入"' in r), None)
        if not row: raise RuntimeError(f"找不到 {code}")
        def cell(label):
            c = re.search(r'data-table="%s"[^>]*>(.*?)</td>' % label, row, re.S)
            return num(re.sub(r"<[^>]+>", "", c.group(1))) if c else None
        d = {"code": code, "name": zh, "unit": 1,
             "spot_buy": cell("本行即期買入"), "spot_sell": cell("本行即期賣出"),
             "cash_buy": cell("本行現金買入"), "cash_sell": cell("本行現金賣出")}
        if d["spot_buy"] is None or d["spot_sell"] is None or not (0 < d["spot_buy"] < d["spot_sell"] < 1000):
            raise RuntimeError(f"{code} 即期匯率數值異常：{d}")
        cur.append(d)
    return {"source": "臺灣銀行牌告匯率", "source_url": "https://rate.bot.com.tw/xrt",
            "listed_at": listed, "listed_note": "牌價最新掛牌時間（台北時間）",
            "fetched_at": datetime.now(TPE).strftime("%Y/%m/%d %H:%M"), "currencies": cur}

def run(*a):
    return subprocess.run(a, cwd=REPO, text=True, capture_output=True)

def main():
    try:
        data = parse(fetch_html())
    except Exception as e:
        print("匯率更新失敗，保留舊檔：", e, file=sys.stderr); sys.exit(1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2); f.write("\n")
    print("掛牌時間", data["listed_at"], " ".join(f'{c["code"]}={c["spot_buy"]}/{c["spot_sell"]}' for c in data["currencies"]))
    if "--push" in sys.argv:
        run("git", "pull", "--rebase", "--autostash", "-q")
        run("git", "add", "data/rates.json")
        if run("git", "diff", "--cached", "--quiet").returncode == 0:
            print("匯率無變更，不提交"); return
        r = run("git", "commit", "-m", f"每日匯率 {data['listed_at']}")
        if r.returncode: print(r.stdout, r.stderr, file=sys.stderr); sys.exit(2)
        r = run("git", "push", "origin", "HEAD")
        if r.returncode: print(r.stderr, file=sys.stderr); sys.exit(3)
        print("已推送")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日匯率：抓「臺灣銀行牌告匯率」(https://rate.bot.com.tw/xrt) → data/rates.json
- 該站對一般 curl 會出驗證頁，故用無頭 Chrome(playwright) 取頁面，再用 data-table 欄位解析（不編造數字）
- 幣別：USD 美金、AUD 澳幣、JPY 日圓、EUR 歐元、CNY 人民幣；欄位：現金買入/賣出、即期買入/賣出
- 抓取或驗證失敗 → 不覆蓋舊檔，結束碼 1
- 另：近一年歷史牌告（臺灣銀行歷史匯率查詢 /xrt/quote/{yyyy-MM}/{幣別}、/xrt/quote/ltm/{幣別}）→ data/rates_history.json
  欄位：每日「即期買入／即期賣出」；缺資料日略過；首次或資料不足時自動回補整年(13 個月頁)，之後每日用 ltm 頁增量合併
  歷史更新失敗 → 不覆蓋舊檔，也不影響即時匯率更新
用法：update_rates.py [--push] [--backfill] [--no-history]   （--push：有變更才 git commit + push）
"""
import sys, os, re, json, subprocess, time
from datetime import datetime, timezone, timedelta

REPO = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(REPO, "data", "rates.json")
HIST = os.path.join(REPO, "data", "rates_history.json")
HIST_DAYS = 365
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

# ---------------- 近一年歷史牌告 ----------------
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

def parse_history_html(html, code):
    """回傳 {YYYY-MM-DD: (即期買入, 即期賣出)}；缺資料（'-'）日略過"""
    out = {}
    if "data-table" not in html and "Quoted Date" not in html:
        raise RuntimeError("歷史頁不含表格（可能被驗證頁擋住）")
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        m = re.search(r'/xrt/quote/(\d{4}-\d{2}-\d{2})/%s/spot' % code, r)
        if not m: continue
        tds = re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)
        vals = [re.sub(r"<[^>]+>", "", t).strip() for t in tds]
        if len(vals) < 6: continue
        b, s = num(vals[4]), num(vals[5])      # 即期買入、即期賣出
        if b is None or s is None or not (0 < b <= s < 1000): continue
        out[m.group(1)] = (b, s)
    return out

def fetch_history(pages):
    """pages：['ltm'] 或 ['2026-09', ...]；回傳 {code: {date: (buy, sell)}}"""
    from playwright.sync_api import sync_playwright
    exe = "/usr/bin/google-chrome"
    res = {c: {} for c, _, _ in WANT}
    with sync_playwright() as p:
        kw = {"args": ["--no-sandbox"], "headless": True}
        if os.path.exists(exe): kw["executable_path"] = exe
        b = p.chromium.launch(**kw)
        ctx = b.new_context(user_agent=UA)
        pg = ctx.new_page()
        pg.goto(URL, wait_until="networkidle", timeout=60000); pg.wait_for_timeout(5000)   # 先過驗證頁
        for code, _, _ in WANT:
            for page in pages:
                u = f"https://rate.bot.com.tw/xrt/quote/{page}/{code}"
                got = None
                for n in range(3):
                    try:
                        pg.goto(u, wait_until="networkidle", timeout=60000)
                        pg.wait_for_timeout(1500)
                        html = pg.content()
                        if "Challenge Validation" in html:
                            pg.wait_for_timeout(6000); html = pg.content()
                        got = parse_history_html(html, code); break
                    except Exception as e:
                        err = e; time.sleep(4)
                if got is None: raise RuntimeError(f"{code} {page} 抓取失敗：{err!r}")
                res[code].update(got)
        b.close()
    return res

def load_hist():
    try:
        with open(HIST, encoding="utf-8") as f: return json.load(f)
    except Exception:
        return None

def update_history(force_backfill=False):
    """回傳 True 表示檔案有更新；失敗則 raise（舊檔不動）"""
    today = datetime.now(TPE).date()
    start = today - timedelta(days=HIST_DAYS)
    old = load_hist()
    have = {}
    if old:
        for c in old["currencies"]:
            have[c["code"]] = {r[0]: (r[1], r[2]) for r in c["rows"]}
    need_full = force_backfill or not old or any(len(have.get(c, {})) < 150 for c, _, _ in WANT)
    if need_full:
        ms, d = [], today.replace(day=1)
        while d >= start.replace(day=1):
            ms.append(d.strftime("%Y-%m")); d = (d - timedelta(days=1)).replace(day=1)
        pages = sorted(ms)
    else:
        pages = ["ltm"]
    new = fetch_history(pages)
    cur = []
    for code, zh, _ in WANT:
        merged = dict(have.get(code, {})); merged.update(new[code])
        rows = [[d, b, s] for d, (b, s) in sorted(merged.items()) if start.isoformat() <= d <= today.isoformat()]
        if len(rows) < (150 if need_full else 100):
            raise RuntimeError(f"{code} 歷史資料筆數異常：{len(rows)}")
        cur.append({"code": code, "name": zh, "rows": rows})
    out = {"source": "臺灣銀行歷史牌告匯率", "source_url": "https://rate.bot.com.tw/xrt/quote/ltm/USD",
           "basis": "每日即期匯率（營業時間）；圖表採「即期賣出」", "fields": ["日期", "即期買入", "即期賣出"],
           "range_start": start.isoformat(), "range_end": today.isoformat(),
           "fetched_at": datetime.now(TPE).strftime("%Y/%m/%d %H:%M"), "currencies": cur}
    # 內容（不含 fetched_at）沒變就不改檔
    if old and {k: v for k, v in old.items() if k != "fetched_at"} == {k: v for k, v in out.items() if k != "fetched_at"}:
        return False
    tmp = HIST + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":")); f.write("\n")
    os.replace(tmp, HIST)
    print("歷史匯率：", " ".join(f'{c["code"]}={len(c["rows"])}天' for c in cur), out["range_start"], "~", out["range_end"])
    return True

def run(*a):
    return subprocess.run(a, cwd=REPO, text=True, capture_output=True)

def main():
    ok_live = True
    try:
        data = parse(fetch_html())
    except Exception as e:
        print("匯率更新失敗，保留舊檔：", e, file=sys.stderr); ok_live = False
    if ok_live:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2); f.write("\n")
        print("掛牌時間", data["listed_at"], " ".join(f'{c["code"]}={c["spot_buy"]}/{c["spot_sell"]}' for c in data["currencies"]))
    if "--no-history" not in sys.argv:
        try:
            update_history("--backfill" in sys.argv)
        except Exception as e:
            print("歷史匯率更新失敗，保留舊檔：", e, file=sys.stderr)
    if not ok_live and "--backfill" not in sys.argv: sys.exit(1)
    if "--push" in sys.argv:
        run("git", "pull", "--rebase", "--autostash", "-q")
        run("git", "add", "data/rates.json", "data/rates_history.json")
        if run("git", "diff", "--cached", "--quiet").returncode == 0:
            print("匯率無變更，不提交"); return
        r = run("git", "commit", "-m", f"每日匯率 {datetime.now(TPE).strftime('%Y/%m/%d %H:%M')}")
        if r.returncode: print(r.stdout, r.stderr, file=sys.stderr); sys.exit(2)
        r = run("git", "push", "origin", "HEAD")
        if r.returncode: print(r.stderr, file=sys.stderr); sys.exit(3)
        print("已推送")

if __name__ == "__main__":
    main()

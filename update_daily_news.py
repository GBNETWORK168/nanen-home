#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""同步「南恩新聞報報」(https://dashin-team.github.io/daily-news/ ，repo dashin-team/daily-news) 到本站。
- 取得最新原站檔案（git clone --depth 1）
- 鏡像到 /daily-news/（index.html、img/、news-*-all.zip），並「移除匯率區塊」與頁尾匯率來源文字（本站已有自己的臺灣銀行牌告匯率區塊）
- 產生縮圖 daily-news/thumb/*.jpg 與 data/daily_news.json（供 finance.html 以本站風格呈現：頭條、指數、海報、剪報）
- 任何一步驗證失敗（找不到區塊、仍殘留「匯率」）→ 不覆蓋、結束碼 1
用法：update_daily_news.py [--push]
"""
import sys, os, re, json, shutil, subprocess, tempfile, glob, html
from PIL import Image

REPO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ensure_auth

SRC = "https://github.com/dashin-team/daily-news.git"
DST = os.path.join(REPO, "daily-news")
OUTJ = os.path.join(REPO, "data", "daily_news.json")

BACK_CSS = ".nn-back{display:block;max-width:640px;margin:0 auto;padding:10px 16px 0;font:600 13px/1.4 'Noto Sans TC',sans-serif;color:#1565c0;text-decoration:none}.nn-back:hover{color:#0e9f9a}"
BACK = '<a class="nn-back" href="../finance.html">← 回南恩官網・每日財經</a>'

def sh(*a, cwd=None):
    r = subprocess.run(a, cwd=cwd, text=True, capture_output=True)
    return r

FORBID = ("匯率", "rate.bot", "fxnote", "D.fx")

def strip_fx(h):
    """index.html：移除匯率區塊、頁內資料 D 的 fx/fxnote、來源文字"""
    i = h.find("<h2>匯率")
    if i < 0: raise RuntimeError("原站找不到匯率區塊（結構可能已改變）")
    j = h.find("<h2>", i + 5)
    if j < 0: raise RuntimeError("匯率區塊之後找不到下一個標題")
    h = h[:i] + h[j:]
    m = re.search(r"const D=(\{.*?\});</script>", h, re.S)
    if not m: raise RuntimeError("找不到頁內資料 D")
    D = json.loads(m.group(1))
    D.pop("fx", None); D.pop("fxnote", None)
    D["sources"] = D.get("sources", "").replace("臺灣銀行牌告匯率、", "")
    h = h[:m.start(1)] + json.dumps(D, ensure_ascii=False) + h[m.end(1):]
    h = h.replace("臺灣銀行牌告匯率（rate.bot.com.tw）、", "")
    h = h.replace("</style>", BACK_CSS + "</style>", 1).replace("<body>", "<body>" + BACK, 1)
    left = [x for x in re.findall(r".{0,20}(?:%s).{0,20}" % "|".join(map(re.escape, FORBID)), h)]
    if left: raise RuntimeError(f"移除後仍殘留匯率字樣：{left[:3]}")
    return h

def strip_app(js):
    """app.js（自選海報產生器）：移除匯率卡片與匯率註解的繪製"""
    js = re.sub(r"D\.fx\.forEach\(.*?y\+238\);\}\);", "", js, flags=re.S)
    js = re.sub(r"c\.fillStyle='rgba\(6,16,45,\.6\)';rr\(c,140,742,800,40,8\);.*?c\.fillText\(D\.fxnote,540,770\);", "", js, flags=re.S)
    js = js.replace("臺銀即期賣出匯率新台幣外幣", "")
    left = re.findall(r".{0,20}(?:%s).{0,20}" % "|".join(map(re.escape, FORBID)), js)
    if left: raise RuntimeError(f"app.js 移除後仍殘留匯率字樣：{left[:3]}")
    return js

def txt(s): return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()

def parse(h):
    """以頁內資料 D 為準（原站已改為資料驅動），輸出本站 data/daily_news.json 需要的結構"""
    m = re.search(r"const D=(\{.*?\});</script>", h, re.S)
    if not m: raise RuntimeError("找不到頁內資料 D")
    D = json.loads(m.group(1))
    d = {}
    t = re.search(r"<title>.*?\|\s*([\d.]+)\s*\|\s*(.*?)</title>", h)
    d["date"] = D.get("date") or (t.group(1) if t else ""); d["title"] = t.group(2) if t else "南恩新聞報報"
    m2 = re.search(r"class=top><span>(.*?)</span>", h); d["date_label"] = txt(m2.group(1)) if m2 else d["date"]
    items = D["items"]
    tops = sorted([i for i in items if i.get("top")], key=lambda i: i["top"])
    d["headlines"] = [{"url": i["url"], "title": i["title"], "source": i["src"], "time": i["time"]} for i in tops]
    d["indices"] = [{"name": n, "value": v, "dir": u, "change": f"{a}（{p}）"} for n, v, a, p, u in D["idx"]]
    d["indices_note"] = D.get("idxnote", "")
    d["posters"] = [{"img": "img/" + f, "caption": f"每日報報 {d['date']}（{n}）", "download": f"{D['D8']}-每日報報-{n}.png"} for f, n in D["posters"]]
    d["clips"] = [{"img": i["img"], "id": i["id"], "caption": i["short"], "download": i["dl"], "source_url": i["url"], "source": f'{i["src"]} {i["time"][:10]}'} for i in items]
    z = re.search(r'href="(news-\d+-all\.zip)"', h); d["zip"] = z.group(1) if z else ""
    if len(d["headlines"]) < 3 or not d["indices"] or not d["posters"] or not d["clips"]:
        raise RuntimeError(f"解析結果不完整：頭條{len(d['headlines'])} 指數{len(d['indices'])} 海報{len(d['posters'])} 剪報{len(d['clips'])}")
    return d

def main():
    with tempfile.TemporaryDirectory() as tmp:
        r = sh("git", "clone", "-q", "--depth", "1", SRC, tmp + "/src")
        if r.returncode: print("抓取失敗：", r.stderr, file=sys.stderr); sys.exit(1)
        s = tmp + "/src"
        try:
            h = strip_fx(open(s + "/index.html", encoding="utf-8").read())
            h = ensure_auth.gate_html(h, "../")   # 登入閘門：auth.js 放 <head> 最前面（原站頁面不含，每次重建都要補回）
            data = parse(h)
        except Exception as e:
            print("處理失敗，保留舊檔：", e, file=sys.stderr); sys.exit(1)
        new = tmp + "/new"; os.makedirs(new + "/img"); os.makedirs(new + "/thumb")
        open(new + "/index.html", "w", encoding="utf-8").write(h)
        if os.path.exists(s + "/app.js"):
            try: open(new + "/app.js", "w", encoding="utf-8").write(strip_app(open(s + "/app.js", encoding="utf-8").read()))
            except Exception as e: print("處理失敗，保留舊檔：", e, file=sys.stderr); sys.exit(1)
        shutil.copytree(s + "/img", new + "/img", dirs_exist_ok=True)
        for f in glob.glob(s + "/news-*-all.zip"): shutil.copy(f, new + "/")
        for it in data["posters"] + data["clips"]:
            src_img = os.path.join(new, it["img"])
            if not os.path.exists(src_img): raise SystemExit(f"缺圖：{it['img']}")
            im = Image.open(src_img).convert("RGB"); im.thumbnail((640, 2000), Image.LANCZOS)
            name = (("clip-" + it["id"]) if it.get("id") else os.path.splitext(os.path.basename(it["img"]))[0]) + ".jpg"
            im.save(new + "/thumb/" + name, quality=80, optimize=True, progressive=True)
            it["thumb"] = "daily-news/thumb/" + name; it["full"] = "daily-news/" + it["img"]; it["download_path"] = it["full"]
            del it["img"]; it.pop("id", None)
        if data["zip"]: data["zip"] = "daily-news/" + data["zip"]
        data["page"] = "daily-news/"; data["source_repo"] = "https://dashin-team.github.io/daily-news/"
        data["synced_at"] = subprocess.run(["date", "+%Y/%m/%d %H:%M"], capture_output=True, text=True).stdout.strip()
        if os.path.exists(DST): shutil.rmtree(DST)
        shutil.copytree(new, DST)
    fixed = ensure_auth.ensure_all(REPO)      # 保險：全站任何頁面缺閘門都補上
    bad = ensure_auth.check_all(REPO)
    if bad: print("登入閘門檢查失敗：", bad, file=sys.stderr); sys.exit(1)
    os.makedirs(os.path.dirname(OUTJ), exist_ok=True)
    json.dump(data, open(OUTJ, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(OUTJ, "a").write("\n")
    print("已同步", data["date"], f'頭條{len(data["headlines"])} 指數{len(data["indices"])} 海報{len(data["posters"])} 剪報{len(data["clips"])}')
    if "--push" in sys.argv:
        sh("git", "pull", "--rebase", "--autostash", "-q", cwd=REPO)
        sh("git", "add", "--", "daily-news", "data/daily_news.json", *fixed, cwd=REPO)
        if sh("git", "diff", "--cached", "--quiet", cwd=REPO).returncode == 0:
            print("無變更，不提交"); return
        r = sh("git", "commit", "-m", f"南恩新聞報報 {data['date']}", cwd=REPO)
        if r.returncode: print(r.stderr, file=sys.stderr); sys.exit(2)
        r = sh("git", "push", "origin", "HEAD", cwd=REPO)
        if r.returncode: print(r.stderr, file=sys.stderr); sys.exit(3)
        print("已推送")

if __name__ == "__main__":
    main()

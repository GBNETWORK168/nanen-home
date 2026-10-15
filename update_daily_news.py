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
SRC = "https://github.com/dashin-team/daily-news.git"
DST = os.path.join(REPO, "daily-news")
OUTJ = os.path.join(REPO, "data", "daily_news.json")

BACK_CSS = ".nn-back{display:block;max-width:640px;margin:0 auto;padding:10px 16px 0;font:600 13px/1.4 'Noto Sans TC',sans-serif;color:#1565c0;text-decoration:none}.nn-back:hover{color:#0e9f9a}"
BACK = '<a class="nn-back" href="../finance.html">← 回南恩官網・每日財經</a>'

def sh(*a, cwd=None):
    r = subprocess.run(a, cwd=cwd, text=True, capture_output=True)
    return r

def strip_fx(h):
    i = h.find("<h2>匯率")
    if i < 0: raise RuntimeError("原站找不到匯率區塊（結構可能已改變）")
    j = h.find("<h2>", i + 5)
    if j < 0: raise RuntimeError("匯率區塊之後找不到下一個標題")
    h = h[:i] + h[j:]
    h = h.replace("臺灣銀行牌告匯率（rate.bot.com.tw）、", "")
    h = h.replace("</style>", BACK_CSS + "</style>", 1).replace("<body>", "<body>" + BACK, 1)
    if "匯率" in h or "rate.bot" in h:
        left = [m for m in re.findall(r".{0,20}(?:匯率|rate\.bot).{0,20}", h)]
        raise RuntimeError(f"移除後仍殘留匯率字樣：{left[:3]}")
    return h

def txt(s): return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()

def parse(h):
    d = {}
    m = re.search(r"<title>.*?\|\s*([\d.]+)\s*\|\s*(.*?)</title>", h); d["date"] = m.group(1) if m else ""; d["title"] = m.group(2) if m else "南恩新聞報報"
    m = re.search(r"class=top><span>(.*?)</span>", h); d["date_label"] = txt(m.group(1)) if m else d["date"]
    heads = []
    for m in re.finditer(r'<a class=hl href="([^"]+)"[^>]*><span class=no>(\d+)</span><span class=ht>(.*?)<small>(.*?)</small></span></a>', h, re.S):
        src = txt(m.group(4)); s, _, t = src.partition("｜")
        heads.append({"url": m.group(1), "title": txt(m.group(3)), "source": s, "time": t})
    d["headlines"] = heads
    sec = h[h.find("<h2>重要指數"):h.find("<h2>今日海報")]
    idx = []
    for m in re.finditer(r'<div class=qn>(.*?)</div><div class=qv>(.*?)</div><div class="(up|dn) qd">(.*?)</div>', sec, re.S):
        idx.append({"name": txt(m.group(1)), "value": txt(m.group(2)), "dir": m.group(3), "change": re.sub(r"^[▲▼]\s*", "", txt(m.group(4)))})
    d["indices"] = idx
    n = re.search(r"<div class=note>(.*?)</div>", sec, re.S); d["indices_note"] = txt(n.group(1)) if n else ""
    figs = re.findall(r"<figure>(.*?)</figure>", h, re.S)
    posters, clips = [], []
    for f in figs:
        img = re.search(r'<img src="([^"]+)" alt="([^"]*)"', f)
        dl = re.search(r'download="([^"]+)"', f)
        link = re.search(r'<a href="([^"]+)"[^>]*>(.*?)›?</a>', f, re.S)
        if not img: continue
        it = {"img": img.group(1), "caption": html.unescape(img.group(2)), "download": dl.group(1) if dl else ""}
        if img.group(1).startswith("img/clip-"):
            it["source_url"] = link.group(1) if link else ""; it["source"] = txt(link.group(2)).replace("原文：", "").strip(" ›") if link else ""
            clips.append(it)
        else:
            posters.append(it)
    d["posters"], d["clips"] = posters, clips
    z = re.search(r'href="(news-\d+-all\.zip)"', h); d["zip"] = z.group(1) if z else ""
    if len(heads) < 3 or not idx or not posters:
        raise RuntimeError(f"解析結果不完整：頭條{len(heads)} 指數{len(idx)} 海報{len(posters)}")
    return d

def main():
    with tempfile.TemporaryDirectory() as tmp:
        r = sh("git", "clone", "-q", "--depth", "1", SRC, tmp + "/src")
        if r.returncode: print("抓取失敗：", r.stderr, file=sys.stderr); sys.exit(1)
        s = tmp + "/src"
        try:
            h = strip_fx(open(s + "/index.html", encoding="utf-8").read())
            data = parse(h)
        except Exception as e:
            print("處理失敗，保留舊檔：", e, file=sys.stderr); sys.exit(1)
        new = tmp + "/new"; os.makedirs(new + "/img"); os.makedirs(new + "/thumb")
        open(new + "/index.html", "w", encoding="utf-8").write(h)
        for f in glob.glob(s + "/img/*"): shutil.copy(f, new + "/img/")
        for f in glob.glob(s + "/news-*-all.zip"): shutil.copy(f, new + "/")
        for it in data["posters"] + data["clips"]:
            src_img = os.path.join(new, it["img"])
            if not os.path.exists(src_img): raise SystemExit(f"缺圖：{it['img']}")
            im = Image.open(src_img).convert("RGB"); im.thumbnail((640, 2000), Image.LANCZOS)
            name = os.path.splitext(os.path.basename(it["img"]))[0] + ".jpg"
            im.save(new + "/thumb/" + name, quality=80, optimize=True, progressive=True)
            it["thumb"] = "daily-news/thumb/" + name; it["full"] = "daily-news/" + it["img"]; it["download_path"] = it["full"]
            del it["img"]
        if data["zip"]: data["zip"] = "daily-news/" + data["zip"]
        data["page"] = "daily-news/"; data["source_repo"] = "https://dashin-team.github.io/daily-news/"
        data["synced_at"] = subprocess.run(["date", "+%Y/%m/%d %H:%M"], capture_output=True, text=True).stdout.strip()
        if os.path.exists(DST): shutil.rmtree(DST)
        shutil.copytree(new, DST)
    os.makedirs(os.path.dirname(OUTJ), exist_ok=True)
    json.dump(data, open(OUTJ, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(OUTJ, "a").write("\n")
    print("已同步", data["date"], f'頭條{len(data["headlines"])} 指數{len(data["indices"])} 海報{len(data["posters"])} 剪報{len(data["clips"])}')
    if "--push" in sys.argv:
        sh("git", "pull", "--rebase", "--autostash", "-q", cwd=REPO)
        sh("git", "add", "daily-news", "data/daily_news.json", cwd=REPO)
        if sh("git", "diff", "--cached", "--quiet", cwd=REPO).returncode == 0:
            print("無變更，不提交"); return
        r = sh("git", "commit", "-m", f"南恩新聞報報 {data['date']}", cwd=REPO)
        if r.returncode: print(r.stderr, file=sys.stderr); sys.exit(2)
        r = sh("git", "push", "origin", "HEAD", cwd=REPO)
        if r.returncode: print(r.stderr, file=sys.stderr); sys.exit(3)
        print("已推送")

if __name__ == "__main__":
    main()

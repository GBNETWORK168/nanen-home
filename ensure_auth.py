#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""確保網站每個 .html 都有登入閘門（auth.js 同步載入於 <head> 最前面）與 noindex。
- 冪等：已有就不動；缺少就依頁面深度插入 <script src="(../)*auth.js"></script>、noindex meta、noscript 隱藏樣式
- 供各更新腳本（update_daily_news.py、publish_to_site.py、publish_funds.py…）在 commit 前呼叫：
    from ensure_auth import ensure_all, check_all   或   python3 ensure_auth.py [--check]
- --check：只檢查，有缺就列出並以結束碼 1 離開
"""
import os, re, sys
REPO = os.path.dirname(os.path.abspath(__file__))
SKIP_DIRS = {".git", "node_modules", "__pycache__"}
HEAD_RE = re.compile(r"<head(\s[^>]*)?>", re.I)
CHARSET_RE = re.compile(r"<meta\s+charset=[^>]*>", re.I)
AUTH_RE = re.compile(r'<script[^>]+src="[^"]*auth\.js[^"]*"', re.I)
META = '<meta name="robots" content="noindex,nofollow,noarchive">'
NOSCRIPT = '<noscript><style>html{display:none!important}</style></noscript>'

def html_files(repo=REPO):
    for d, ds, fs in os.walk(repo):
        ds[:] = [x for x in ds if x not in SKIP_DIRS]
        for f in fs:
            if f.lower().endswith(".html"): yield os.path.join(d, f)

def prefix(path, repo=REPO):
    depth = os.path.relpath(os.path.dirname(path), repo).count(os.sep) + (0 if os.path.dirname(path) == repo else 1)
    return "../" * depth

def gate_html(src, pre):
    """回傳加上閘門後的 html 字串（已具備則原樣回傳）"""
    if AUTH_RE.search(src): return src
    m = HEAD_RE.search(src)
    if not m: raise ValueError("找不到 <head>")
    tag = f'<script src="{pre}auth.js"></script>'
    ins = tag + (META if "noindex" not in src else "") + NOSCRIPT
    pos = m.end()
    cm = CHARSET_RE.match(src, pos) or re.compile(r"\s*").match(src, pos) and CHARSET_RE.match(src, re.compile(r"\s*").match(src, pos).end())
    if cm and cm.start() - pos < 200: pos = cm.end()
    return src[:pos] + ins + src[pos:]

def missing(repo=REPO):
    return [p for p in html_files(repo) if not AUTH_RE.search(open(p, encoding="utf-8", errors="ignore").read())]

def ensure_all(repo=REPO):
    fixed = []
    for p in missing(repo):
        s = open(p, encoding="utf-8").read()
        open(p, "w", encoding="utf-8").write(gate_html(s, prefix(p, repo)))
        fixed.append(os.path.relpath(p, repo))
    return fixed

def check_all(repo=REPO):
    return [os.path.relpath(p, repo) for p in missing(repo)]

if __name__ == "__main__":
    if "--check" in sys.argv:
        m = check_all()
        print("缺少登入閘門：" + ", ".join(m) if m else "全部頁面已有登入閘門（%d 頁）" % len(list(html_files())))
        sys.exit(1 if m else 0)
    f = ensure_all()
    print("已補上登入閘門：%d 頁" % len(f), *f[:5])

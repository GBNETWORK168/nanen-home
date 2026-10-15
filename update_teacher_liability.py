#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""同步「教師責任險」(https://dashin-team.github.io/teacher-liability/) → /teacher-liability/
- git clone --depth 1 原站 repo，鏡像全部檔案（排除 .git）；index.html 補上：登入閘門(auth.js)、返回官網連結列、noindex
- 原站為單頁靜態（目前無本地資源）；若日後新增圖片/檔案，會一併複製，並檢查 html 內的相對路徑是否都存在
- 失敗（抓取、處理、檢查）→ 保留舊檔，結束碼 1；--push：有變更才 commit + push（碼 2 commit 失敗、3 push 失敗）
用法：update_teacher_liability.py [--push]
"""
import sys, os, re, shutil, subprocess, tempfile
REPO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, REPO)
import ensure_auth
SRC = "https://github.com/dashin-team/teacher-liability.git"
DST = os.path.join(REPO, "teacher-liability")
BACK_CSS = ".nn-back{display:block;padding:8px 6vw 0;font:600 13px/1.4 'Noto Sans TC','PingFang TC',sans-serif;color:#2f6f6a;text-decoration:none;position:relative;z-index:5}.nn-back:hover{color:#1f4d4a}"
BACK = '<a class="nn-back" href="../index.html#tools">← 回南恩通訊處官網</a>'

def sh(*a, cwd=None): return subprocess.run(a, cwd=cwd, text=True, capture_output=True)

def process(h):
    if "</style>" not in h or "<body" not in h: raise RuntimeError("原站頁面結構與預期不同（找不到 </style> 或 <body>）")
    h = h.replace("</style>", BACK_CSS + "</style>", 1)
    h = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + BACK, h, count=1)
    return ensure_auth.gate_html(h, "../")

def check_refs(root):
    h = open(os.path.join(root, "index.html"), encoding="utf-8").read()
    miss = []
    for u in re.findall(r'(?:src|href)=["\']?(?!https?:|data:|#|mailto:|tel:|javascript:)([^"\' >#?]+)', h):
        if u.startswith("../"): continue
        if not os.path.exists(os.path.join(root, u)): miss.append(u)
    return miss

def main():
    with tempfile.TemporaryDirectory() as tmp:
        r = sh("git", "clone", "-q", "--depth", "1", SRC, tmp + "/src")
        if r.returncode: print("抓取失敗：", r.stderr, file=sys.stderr); sys.exit(1)
        new = tmp + "/new"
        shutil.copytree(tmp + "/src", new, ignore=shutil.ignore_patterns(".git", ".nojekyll"))
        try:
            h = process(open(new + "/index.html", encoding="utf-8").read())
            open(new + "/index.html", "w", encoding="utf-8").write(h)
            miss = check_refs(new)
            if miss: raise RuntimeError(f"相對路徑資源缺漏：{miss[:5]}")
        except Exception as e:
            print("處理失敗，保留舊檔：", e, file=sys.stderr); sys.exit(1)
        if os.path.exists(DST): shutil.rmtree(DST)
        shutil.copytree(new, DST)
    bad = ensure_auth.check_all(REPO)
    if bad: print("登入閘門檢查失敗：", bad, file=sys.stderr); sys.exit(1)
    print("已同步教師責任險，檔案：", sorted(os.listdir(DST)))
    if "--push" in sys.argv:
        sh("git", "pull", "--rebase", "--autostash", "-q", cwd=REPO)
        sh("git", "add", "--", "teacher-liability", cwd=REPO)
        if sh("git", "diff", "--cached", "--quiet", cwd=REPO).returncode == 0: print("無變更，不提交"); return
        r = sh("git", "commit", "-m", "教師責任險同步", cwd=REPO)
        if r.returncode: print(r.stdout, r.stderr, file=sys.stderr); sys.exit(2)
        r = sh("git", "push", "origin", "HEAD", cwd=REPO)
        if r.returncode: print(r.stderr, file=sys.stderr); sys.exit(3)
        print("已推送")

if __name__ == "__main__":
    main()

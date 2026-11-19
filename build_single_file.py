#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
单证通 TradeDocs — 单文件构建脚本

把 index.html 引用的本地 CSS/JS 内联成一个可直接双击打开的 HTML。
无第三方依赖，仅使用 Python 标准库。

用法:
    python build_single_file.py

输出:
    dist/单证通-外贸单证系统.html
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "index.html"
OUT_DIR = ROOT / "dist"
OUT_FILE = OUT_DIR / "单证通-外贸单证系统.html"

LINK_RE = re.compile(
    r"""<link\b[^>]*?href\s*=\s*["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*?>""",
    re.IGNORECASE,
)
SCRIPT_RE = re.compile(
    r"""<script\b[^>]*?src\s*=\s*["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*?>\s*</script>""",
    re.IGNORECASE,
)
LOCAL_REF_RE = re.compile(
    r"""(?:src|href)\s*=\s*["']([^"'#][^"']*)["']""",
    re.IGNORECASE,
)

EXPECTED_SCRIPTS = ["core.js", "demo.js", "recognize.js", "doc-templates.js", "store.js", "app.js"]


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def is_remote(ref: str) -> bool:
    ref = ref.strip().lower()
    return (
        ref.startswith(("http://", "https://", "//", "data:", "mailto:", "tel:", "javascript:"))
        or ref.startswith("#")
    )


def resolve_local(ref: str) -> Path:
    clean = ref.split("?", 1)[0].split("#", 1)[0].replace("\\", "/")
    if clean.startswith("/"):
        clean = clean.lstrip("/")
    return (ROOT / clean).resolve()


def inline_css(match: re.Match[str], inlined: list[str]) -> str:
    ref = match.group(1)
    if is_remote(ref):
        return match.group(0)
    path = resolve_local(ref)
    if not path.is_file():
        raise FileNotFoundError(f"CSS 文件不存在: {ref}")
    content = read_text(path)
    inlined.append(ref)
    return f"<style data-source=\"{ref}\">\n/* ---- {ref} ---- */\n{content}\n</style>"


def inline_js(match: re.Match[str], inlined: list[str]) -> str:
    ref = match.group(1)
    if is_remote(ref):
        return match.group(0)
    path = resolve_local(ref)
    if not path.is_file():
        raise FileNotFoundError(f"JS 文件不存在: {ref}")
    content = read_text(path)
    # 防止 JS 中的 </script> 提前结束内联脚本
    content = re.sub(r"</script", r"<\\/script", content, flags=re.IGNORECASE)
    inlined.append(ref)
    return f"<script data-source=\"{ref}\">\n/* ---- {ref} ---- */\n{content}\n</script>"


def check_leftovers(html: str) -> list[str]:
    problems: list[str] = []
    for match in LOCAL_REF_RE.finditer(html):
        ref = match.group(1).strip()
        if not ref or is_remote(ref):
            continue
        if ref.endswith((".html", ".htm")):
            continue  # 允许页面内跳转
        problems.append(ref)
    return problems


def main() -> int:
    if not SOURCE.is_file():
        print(f"[ERROR] 找不到 {SOURCE}", file=sys.stderr)
        return 1

    html = read_text(SOURCE)

    for name in EXPECTED_SCRIPTS:
        if f"{name}" not in html:
            print(f"[WARN] index.html 未引用 {name}，产物可能不完整", file=sys.stderr)

    inlined: list[str] = []
    html = LINK_RE.sub(lambda m: inline_css(m, inlined), html)
    html = SCRIPT_RE.sub(lambda m: inline_js(m, inlined), html)

    # 内联后不应再残留本地资源引用（图片若用了本地文件则需 dataURL）
    leftovers = check_leftovers(html)
    if leftovers:
        print("[WARN] 以下本地资源未被内联，单文件版可能缺失:", file=sys.stderr)
        for item in sorted(set(leftovers)):
            print(f"  - {item}", file=sys.stderr)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(html, encoding="utf-8", newline="\n")

    size_kb = OUT_FILE.stat().st_size / 1024
    print("单文件构建完成")
    print(f"  输出: {OUT_FILE}")
    print(f"  大小: {size_kb:.1f} KB")
    print(f"  内联: {len(inlined)} 个文件 ({', '.join(inlined)})")
    print("  使用: 双击该 HTML 即可离线使用；也可上传到任意静态托管。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

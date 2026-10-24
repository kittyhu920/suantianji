"""按站内实际用字（扫描 src/ 下的 .astro / .svelte / .js / .css / .md / .json），把几款字体裁成子集，
输出到 public/fonts/（Astro 原样发布），并生成 src/core/styles/fonts.css。

改了任何中文文案之后都要重跑一次：python tools/subset-fonts.py

字体分工（docs/DESIGN.md §4）：
- 汇文明朝体 Huiwen-mincho（--f-display）：卷名、标题、签名、签诗、卦名、结局名、印文。
  收界面（.astro / .svelte / .js / .css）、讲解页（.md）与签簿、卦簿里会以明朝体显示的字段（签名、签诗、结局名与结局诗、领域、卦名）。
  许可待确认，正式上线前可能换成文津明朝或思源宋体：换字体时只改下面 DISPLAY 的一项来源，
  以及 src/core/styles/base.css 里的 --f-display。
- 霞鹜文楷 LXGW WenKai（--f-kai，OFL 1.1，v1.530）：眉批、注、账本旁注、通灵的"实话"。
  收界面与各卷 zhu.json 里的字；通灵由 AI 实时生成，用 GB2312 一级字库其余的字另拆一个文件，
  用 unicode-range 声明，页面真出现这些字时才下载。
- 龙藏体 Long Cang（--f-voice，OFL 1.1）：书自己的字——书开口时写在扉页上的话、你写在纸笺上的问题、命书里问题的那一行。
  开源行书，字形比志莽行书清楚、比马善政楷书有笔势、比柳建毛草好认（对照见 docs/DESIGN.md §4）。用字与霞鹜文楷相同（界面里的字加各卷注疏），缺的字回落到霞鹜文楷。
  要换字体：改下面 SOURCES / SHA256 / VOICE 的一项，以及 src/core/styles/base.css 的 --f-voice、src/core/book/paint.js 的 F.voice。
- 思源宋体 400（正文、按钮、表单、账本）拆成两个文件：站内用字，首屏加载；GB2312 一级字库其余的字（unicode-range）。
  两者都没有的生僻字，回落到系统字体。
- 思源宋体 600（按钮、小标题、注的术语名）：界面里的字，加注疏与讲解页（.md、.json）里的字。

源字体缓存在 .cache/fonts/（不入库），缺失时自动下载：
- 霞鹜文楷：官方 release v1.530 的 Regular TTF，下载后校验 SHA-256。
- 汇文明朝体：npm 包 @chinese-fonts/hwmct 的切片（经 jsDelivr），没有完整 TTF；这里按需要的字挑出切片，裁剪后合并成一个字体。
- 思源宋体：notofonts/noto-cjk 的简体中文（经 jsDelivr 下载，GitHub 直连太慢）。
"""

import hashlib
import re
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

from compose_glyph import compose  # 给书法字体补造"筊"等缺字

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
PUBLIC = ROOT / 'public'
CACHE = ROOT / '.cache' / 'fonts'
OUT = PUBLIC / 'fonts'
FONTS_CSS = SRC / 'core' / 'styles' / 'fonts.css'
DB = SRC / 'juan' / 'qian' / 'fortune-db.json'

SOURCES = {
    'NotoSerifSC-Regular.otf': 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf',
    'NotoSerifSC-SemiBold.otf': 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-SemiBold.otf',
    'LXGWWenKai-Regular.ttf': 'https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf',
    'LongCang-Regular.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/longcang/LongCang-Regular.ttf',
}
SHA256 = {
    'LXGWWenKai-Regular.ttf': '2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b',
    'LongCang-Regular.ttf': 'e5bf2c3f24ef2327c6f136d8f73e2f9dfdf44896fdbeb35a9515f44777bb91bc',
}
# 书的字体（--f-voice）：开源行书。换字体时，族名在 FACE 里、文件名在 main() 里改
VOICE = {'family': 'Long Cang', 'source': 'LongCang-Regular.ttf', 'file': 'long-cang.woff2'}
# 展示字体（--f-display）的来源：汇文明朝体的切片包。换成别的明朝体时，改这一项和 main() 里 display 的取法
DISPLAY = {
    'family': 'Huiwen-mincho',
    'base': 'https://cdn.jsdelivr.net/npm/@chinese-fonts/hwmct@3.0.0/dist/' + urllib.parse.quote('汇文明朝体') + '/',
    'dir': 'huiwen-slices',
}

CODE = {'.astro', '.svelte', '.js', '.css'}  # 界面里的字
TEXT = {'.md', '.json'}  # 讲解、注疏与签簿：正文与小标题


def download(url, path, tries=5):
    """带重试的下载（jsDelivr 偶尔会断开连接）。"""
    import time
    for i in range(tries):
        try:
            urllib.request.urlretrieve(url, path)
            return
        except OSError:
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def fetch(name):
    path = CACHE / name
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f'下载 {name} ……')
        download(SOURCES[name], path)
    want = SHA256.get(name)
    if want and hashlib.sha256(path.read_bytes()).hexdigest() != want:
        path.unlink()
        raise SystemExit(f'{name} 校验失败（SHA-256 不符），已删除，请重试')
    return path


def fetch_display_slices():
    """汇文明朝体的切片：按 result.css 里列出的文件名下载到缓存，返回本地路径列表。"""
    d = CACHE / DISPLAY['dir']
    d.mkdir(parents=True, exist_ok=True)
    css_path = d / 'result.css'
    if not css_path.exists():
        download(DISPLAY['base'] + 'result.css', css_path)
    names = sorted(set(re.findall(r'url\("\./([0-9a-f]+\.woff2)"\)', css_path.read_text(encoding='utf-8'))))
    for n in names:
        if not (d / n).exists():
            download(DISPLAY['base'] + n, d / n)
    return [d / n for n in names]


def build_display(chars):
    """从切片里挑出含所需字的，各自裁剪，再合并成一个字体。返回 (font, 缺字集合)。"""
    chars = set(chars) | set('笑交')  # 笑、交用来补造"筊"
    have = set()
    parts = []
    tmp = Path(tempfile.mkdtemp(prefix='stj-hw-'))
    for i, p in enumerate(fetch_display_slices()):
        f = TTFont(p)
        hit = chars & {chr(c) for c in f.getBestCmap()}
        if not hit:
            continue
        opts = subset.Options()
        opts.layout_features = []
        opts.notdef_outline = True
        opts.hinting = False
        opts.name_IDs = ['*']
        sub = subset.Subsetter(opts)
        sub.populate(text=''.join(hit))
        sub.subset(f)
        out = tmp / f'{i}.ttf'
        f.save(out)
        parts.append(str(out))
        have |= hit
    merged = Merger().merge(parts)
    return merged, chars - have


def scan(suffixes, skip=()):
    chars = set()
    for p in SRC.rglob('*'):
        if p.suffix in suffixes and p.name not in skip and p != FONTS_CSS:
            chars.update(p.read_text(encoding='utf-8'))
    return {c for c in chars if not c.isspace()}


def site_chars():
    """src/ 下全部文件里的字（含签簿、注疏、讲解页）。"""
    return scan(CODE | TEXT)


def ui_chars():
    """界面里的字（.astro / .svelte / .js / .css），再加注疏与讲解页的小标题字（宋体 600 用）。"""
    return scan(CODE)


def heading_chars():
    """注疏的术语名、讲解页的标题：用宋体 600。"""
    chars = scan({'.md', '.json'}, skip={'fortune-db.json'})
    return chars


def display_chars():
    """汇文明朝体用字：界面里的字，讲解页，加签簿里会以明朝体显示的字段（签名、签诗、等级、结局名、领域）与卦名。"""
    import json
    db = json.loads(DB.read_text(encoding='utf-8'))
    chars = scan(CODE, skip={'shuowen-bushou.js'})
    for md in SRC.rglob('*.md'):  # 讲解页只有题名、提要与小标题用明朝体
        head = [l for l in md.read_text(encoding='utf-8').splitlines() if l.startswith(('title:', 'lead:', '#'))]
        chars.update(''.join(head))
    for s in db['signs']:
        chars.update(s['name'] + s['level'] + ''.join(s['poem']))
    for e in db['endings'].values():
        chars.update(e['name'] + e['sub'] + ''.join(e['verse']))
    for d in db['domains'].values():
        chars.update(d['name'] + d['desc'])
    gua = json.loads((SRC / 'juan' / 'gua' / 'gua.json').read_text(encoding='utf-8'))
    for h in gua['hexagrams']:
        chars.update(h['name'])
    for e in gua['endings'].values():
        chars.update(e['name'] + e['sub'] + ''.join(e['verse']))
    for d in gua['domains'].values():
        chars.update(d['name'] + d['desc'])
    return chars


def kai_chars():
    """霞鹜文楷用字：界面里的字（眉批、账本旁注等写在 .js / .svelte 里），加各卷 zhu.json（注）。"""
    chars = scan(CODE, skip={'shuowen-bushou.js'})
    for p in (SRC / 'juan').glob('*/zhu.json'):
        chars.update(p.read_text(encoding='utf-8'))
    return {c for c in chars if not c.isspace()}


def gb2312_level1():
    chars = set()
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return chars


# ASCII 可见字符和常用中文标点，正文里 AI 可能用到
BASICS = set(chr(c) for c in range(0x20, 0x7F)) | set('，。、；：？！“”‘’（）《》〈〉【】…—～·「」『』%％')


def write(font, chars, name):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    font.flavor = 'woff2'
    font.save(path)
    print(f'{name}: {len(chars)} 字，{path.stat().st_size / 1024:.0f} KB')


def unicode_range(chars):
    cps = sorted(ord(c) for c in chars)
    spans = []
    for cp in cps:
        if spans and cp == spans[-1][1] + 1:
            spans[-1][1] = cp
        else:
            spans.append([cp, cp])
    return ','.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in spans)


FACE = '''@font-face {{
  font-family: "{family}";
  font-weight: {weight};
  font-display: swap;
  src: url("/fonts/{file}") format("woff2");{range}
}}
'''


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    used = site_chars() | BASICS
    extra = gb2312_level1() - used

    # 汇文明朝体
    disp_font, missing = build_display(display_chars() | BASICS)
    compose(disp_font)
    if ord('筊') in disp_font.getBestCmap():
        missing.discard('筊')
    write(disp_font, (display_chars() | BASICS) - missing, 'huiwen-mincho.woff2')
    if missing:
        print('汇文明朝体缺字（回落到思源宋体）：' + ''.join(sorted(missing)))

    # 霞鹜文楷：站内用字 + GB2312 其余
    kai_used = kai_chars() | BASICS
    kai_extra = gb2312_level1() - kai_used
    kai_src = fetch('LXGWWenKai-Regular.ttf')
    kai = TTFont(kai_src)
    compose(kai)
    kai_have = {chr(c) for c in kai.getBestCmap()}
    kai_missing = {c for c in kai_used if c not in kai_have}
    if kai_missing:
        print('霞鹜文楷缺字（回落到思源宋体）：' + ''.join(sorted(kai_missing)))
    write(kai, kai_used, 'lxgw-wenkai.woff2')
    kai2 = TTFont(kai_src)
    write(kai2, kai_extra, 'lxgw-wenkai-extra.woff2')

    # 龙藏体（书的字）：站内用字；缺的字（如“筊”）回落到霞鹜文楷
    voice = TTFont(fetch(VOICE['source']))
    voice_have = {chr(c) for c in voice.getBestCmap()}
    voice_missing = {c for c in kai_used if c not in voice_have and '一' <= c <= '鿿'}
    if voice_missing:
        print('龙藏体缺字（回落到霞鹜文楷）：' + ''.join(sorted(voice_missing)))
    write(voice, kai_used, VOICE['file'])

    write(TTFont(fetch('NotoSerifSC-Regular.otf')), used, 'noto-serif-sc-400.woff2')
    write(TTFont(fetch('NotoSerifSC-Regular.otf')), extra, 'noto-serif-sc-400-extra.woff2')
    write(TTFont(fetch('NotoSerifSC-SemiBold.otf')), ui_chars() | heading_chars() | BASICS, 'noto-serif-sc-600.woff2')

    css = '/* 由 tools/subset-fonts.py 生成，不要手改 */\n'
    css += FACE.format(family=DISPLAY['family'], weight=400, file='huiwen-mincho.woff2', range='')
    css += FACE.format(family='LXGW WenKai', weight=400, file='lxgw-wenkai.woff2', range='')
    css += FACE.format(family='LXGW WenKai', weight=400, file='lxgw-wenkai-extra.woff2',
                       range=f'\n  unicode-range: {unicode_range(kai_extra)};')
    css += FACE.format(family=VOICE['family'], weight=400, file=VOICE['file'], range='')
    css += FACE.format(family='Noto Serif SC', weight=400, file='noto-serif-sc-400.woff2', range='')
    css += FACE.format(family='Noto Serif SC', weight=400, file='noto-serif-sc-400-extra.woff2',
                       range=f'\n  unicode-range: {unicode_range(extra)};')
    css += FACE.format(family='Noto Serif SC', weight=600, file='noto-serif-sc-600.woff2', range='')
    FONTS_CSS.write_text(css, encoding='utf-8', newline='')
    print(f'fonts.css: {len(css) / 1024:.0f} KB')


if __name__ == '__main__':
    main()

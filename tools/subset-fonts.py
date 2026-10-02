"""按站内实际用字，把两款字体裁成子集，输出到 public/fonts/。

改了任何中文文案之后都要重跑一次：python tools/subset-fonts.py

- 马善政行楷（标题、签名、印章）：只收页面与脚本里的字，加上签名、等级、结局名；
  签诗、白话等正文用宋体，不收进行楷。
- 思源宋体 400（正文）拆成两个文件：
  · 站内用字，首屏加载；
  · GB2312 一级字库（3755 个常用字）里其余的字。通灵解签由 AI 实时生成、玩家的问题由玩家输入，
    事先无法预知用字。这个文件用 unicode-range 声明，只有页面真出现这些字时浏览器才会下载。
  两者都没有的生僻字，回落到系统字体。
- 思源宋体 600（按钮、小标题）：只收页面与脚本里的字。
- 志莽行书（大标题）：只收页面与脚本里的字。

源字体：马善政来自 Google Fonts 官方仓库，思源宋体来自 notofonts/noto-cjk 的简体中文静态字重
（经 jsDelivr 下载，GitHub 直连太慢）。缓存在 .cache/fonts/（不入库），缺失时自动下载。
"""

import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

from compose_glyph import compose  # 给书法字体补造"筊"等缺字

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
CACHE = ROOT / '.cache' / 'fonts'
OUT = PUBLIC / 'fonts'

SOURCES = {
    'MaShanZheng-Regular.ttf': 'https://github.com/google/fonts/raw/main/ofl/mashanzheng/MaShanZheng-Regular.ttf',
    'ZhiMangXing-Regular.ttf': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zhimangxing/ZhiMangXing-Regular.ttf',
    'NotoSerifSC-Regular.otf': 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf',
    'NotoSerifSC-SemiBold.otf': 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Serif/SubsetOTF/SC/NotoSerifSC-SemiBold.otf',
}


def fetch(name):
    path = CACHE / name
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f'下载 {name} ……')
        urllib.request.urlretrieve(SOURCES[name], path)
    return path


def site_chars():
    chars = set()
    for p in PUBLIC.rglob('*'):
        if p.suffix in {'.html', '.js', '.json', '.css'} and OUT not in p.parents:
            chars.update(p.read_text(encoding='utf-8'))
    return {c for c in chars if not c.isspace()}


def ui_chars():
    """页面与脚本里的字（不含签簿数据）。"""
    chars = set()
    for p in PUBLIC.rglob('*'):
        if p.suffix in {'.html', '.js', '.css'} and OUT not in p.parents:
            chars.update(p.read_text(encoding='utf-8'))
    return {c for c in chars if not c.isspace()}


def brush_chars():
    """行楷用字：页面与脚本，加签簿里会以行楷显示的字段。"""
    import json
    db = json.loads((PUBLIC / 'data' / 'fortune-db.json').read_text(encoding='utf-8'))
    chars = ui_chars()
    for s in db['signs']:
        chars.update(s['name'] + s['level'])
    for e in db['endings'].values():
        chars.update(e['name'] + e['sub'])
    for d in db['domains'].values():
        chars.update(d['name'] + d['desc'])
    return chars


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
  src: url("../fonts/{file}") format("woff2");{range}
}}
'''


def main():
    used = site_chars() | BASICS
    extra = gb2312_level1() - used

    brush = TTFont(fetch('MaShanZheng-Regular.ttf'))
    compose(brush)
    write(brush, brush_chars() | BASICS, 'ma-shan-zheng.woff2')
    write(TTFont(fetch('NotoSerifSC-Regular.otf')), used, 'noto-serif-sc-400.woff2')
    write(TTFont(fetch('NotoSerifSC-Regular.otf')), extra, 'noto-serif-sc-400-extra.woff2')
    write(TTFont(fetch('NotoSerifSC-SemiBold.otf')), ui_chars() | BASICS, 'noto-serif-sc-600.woff2')
    title = TTFont(fetch('ZhiMangXing-Regular.ttf'))
    compose(title)
    write(title, ui_chars() | BASICS, 'zhi-mang-xing.woff2')

    css = '/* 由 tools/subset-fonts.py 生成，不要手改 */\n'
    css += FACE.format(family='Ma Shan Zheng', weight=400, file='ma-shan-zheng.woff2', range='')
    css += FACE.format(family='Noto Serif SC', weight=400, file='noto-serif-sc-400.woff2', range='')
    css += FACE.format(family='Noto Serif SC', weight=400, file='noto-serif-sc-400-extra.woff2',
                       range=f'\n  unicode-range: {unicode_range(extra)};')
    css += FACE.format(family='Noto Serif SC', weight=600, file='noto-serif-sc-600.woff2', range='')
    css += FACE.format(family='Zhi Mang Xing', weight=400, file='zhi-mang-xing.woff2', range='')
    (PUBLIC / 'css' / 'fonts.css').write_text(css, encoding='utf-8', newline='')
    print(f'fonts.css: {len(css) / 1024:.0f} KB')


if __name__ == '__main__':
    main()

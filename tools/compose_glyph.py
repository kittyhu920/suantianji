"""给书法字体补造缺失的字：把已有字的部件拼起来。

"筊"是生僻字，志莽行书、马善政楷书、刘建毛草都没有，标题里会回落成宋体。
这里取同一款字体里"笑"的竹字头，加上压扁的"交"，拼成一个"筊"，笔意与周围的字一致。
这几款字体均为 SIL OFL 授权，允许修改；修改后的子集只随本站发布。
"""

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.boundsPen import BoundsPen

# 要补的字：新字 -> (取上部的字, 取下部的字)
RECIPES = {
    '筊': ('笑', '交'),
}


def _contours(font, char):
    """把一个字拆成若干条轮廓，每条轮廓是 RecordingPen 的指令列表。"""
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord(char)]
    rec = DecomposingRecordingPen(gs)
    gs[name].draw(rec)
    contours, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ('closePath', 'endPath'):
            contours.append(cur)
            cur = []
    return contours, gs[name].width


def _bounds(font, contour):
    bp = BoundsPen(font.getGlyphSet())
    for op, args in contour:
        getattr(bp, op)(*args)
    return bp.bounds


def _replay(pen, contour):
    for op, args in contour:
        getattr(pen, op)(*args)


def compose(font):
    """在 font（TrueType glyf 字体）里补造 RECIPES 中缺失的字。返回补了几个。"""
    if 'glyf' not in font:
        return 0
    cmap = font.getBestCmap()
    added = 0
    for new, (top_char, bottom_char) in RECIPES.items():
        if ord(new) in cmap or ord(top_char) not in cmap or ord(bottom_char) not in cmap:
            continue
        top, width = _contours(font, top_char)
        bottom, _ = _contours(font, bottom_char)
        # 竹字头：取"笑"里整体位于上部的轮廓
        ys = [b for c in top if (b := _bounds(font, c))]
        y_min = min(b[1] for b in ys)
        y_max = max(b[3] for b in ys)
        cut = y_min + (y_max - y_min) * 0.5  # 以字的中线为界：竹字头各笔都在中线以上
        head = [c for c in top if (b := _bounds(font, c)) and b[1] >= cut]
        head_bottom = min(_bounds(font, c)[1] for c in head)
        # "交"：压扁到竹字头下方
        bb = [b for c in bottom if (b := _bounds(font, c))]
        b_min = min(b[1] for b in bb)
        b_max = max(b[3] for b in bb)
        target_top = head_bottom - (y_max - y_min) * 0.02
        target_bottom = y_min
        sy = (target_top - target_bottom) / (b_max - b_min)
        sx = 0.94
        dx = width * (1 - sx) / 2
        dy = target_bottom - b_min * sy

        pen = TTGlyphPen(font.getGlyphSet())
        for c in head:
            _replay(pen, c)
        tpen = TransformPen(pen, (sx, 0, 0, sy, dx, dy))
        for c in bottom:
            _replay(tpen, c)

        gname = f'uni{ord(new):04X}'
        font['glyf'][gname] = pen.glyph()
        font['hmtx'][gname] = (width, 0)
        order = font.getGlyphOrder()
        if gname not in order:
            font.setGlyphOrder(order + [gname])
        for table in font['cmap'].tables:
            if table.isUnicode():
                table.cmap[ord(new)] = gname
        added += 1
    return added

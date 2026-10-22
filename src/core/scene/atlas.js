// 字形图集：把一盘字的每个字画成一格反字（镜像），拼成一张画布，供 3D 铅字当凸起的高度图用。
// 运行时由 Canvas 生成，不用位图素材。R 通道就是字的高度（白＝凸起），也当字形的遮罩。

const FONT = '"Noto Serif SC", "Songti SC", "STSong", serif';
export const CELL = 48;
export const MAX_CELLS = 1024; // 32 × 32 格，图集 1536 × 1536

/** 去重并截到上限；返回 { list, index } */
export function uniqueChars(chars, max = MAX_CELLS) {
  const index = new Map();
  const list = [];
  for (const ch of chars) {
    if (index.has(ch)) continue;
    if (list.length >= max) break;
    index.set(ch, list.length);
    list.push(ch);
  }
  return { list, index };
}

export function buildAtlas(list) {
  const side = Math.max(4, Math.ceil(Math.sqrt(list.length)));
  const cv = document.createElement('canvas');
  cv.width = cv.height = side * CELL;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `400 ${Math.round(CELL * 0.74)}px ${FONT}`;
  list.forEach((ch, i) => {
    const cx = (i % side) * CELL + CELL / 2;
    const cy = Math.floor(i / side) * CELL + CELL / 2 + CELL * 0.03;
    g.save();
    g.translate(cx, cy);
    g.scale(-1, 1); // 反字：镜像
    g.fillText(ch, 0, 0);
    g.restore();
  });
  return { canvas: cv, side };
}

/** 第 i 个字在图集里的 uv：返回 [u0, v0, du, dv]（画布自上而下，纹理 v 向上，所以要翻一下） */
export function cellUv(i, side) {
  const c = i % side;
  const r = Math.floor(i / side);
  return [c / side, 1 - (r + 1) / side, 1 / side, 1 / side];
}

// 一个一个字洇开的文字：每个字是一个带延迟的 span（样式见 styles/base.css 的 .ink-ch）

export function inkChar(ch, delay = 0) {
  const c = document.createElement('span');
  c.className = 'ink-ch';
  c.textContent = ch;
  if (delay) c.style.animationDelay = `${delay}ms`;
  return c;
}

export function inkChars(parent, text, start = 0, step = 55) {
  [...text].forEach((ch, i) => parent.append(inkChar(ch, start + i * step)));
}

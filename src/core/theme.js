// 双主题（docs/DESIGN.md §17）：浅色"宣纸"与深色"乌金拓"。
// 首帧之前由 Paper.astro 里的内联脚本把 data-theme 设好；这里管切换、记忆，以及给画布取色。
// 来源：用户手动选过的存在 localStorage（读写都包 try/catch）；没选过就跟随系统的 prefers-color-scheme。

const KEY = 'stj-theme';
const system = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export const isDark = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

export function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch { return null; }
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0a08' : '#1A1C1E');
  dispatchEvent(new CustomEvent('stj-theme', { detail: theme }));
}

/** 手动设定并记住 */
export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* 存不了就只在本页有效 */ }
  apply(theme);
}

export const toggleTheme = () => setTheme(isDark() ? 'light' : 'dark');

/** 主题变化时回调（含系统切换）；返回取消函数 */
export function onTheme(fn) {
  const h = (e) => fn(e.detail);
  addEventListener('stj-theme', h);
  return () => removeEventListener('stj-theme', h);
}

/** 没手动选过时，系统主题变了就跟着变 */
export function followSystem() {
  const h = () => { if (!stored()) apply(system.matches ? 'dark' : 'light'); };
  system?.addEventListener?.('change', h);
}

// 画布用的墨色：书页上落的墨，昼夜都是墨（深色主题里书仍是纸色）
export const inkRgb = () => [27, 23, 18];

/** 把页面上的主题开关接起来 */
export function mountToggle(btn) {
  if (!btn) return;
  const sync = () => {
    const dark = isDark();
    btn.textContent = dark ? '夜' : '昼';
    btn.setAttribute('aria-label', dark ? '切换到浅色主题：宣纸' : '切换到深色主题：乌金拓');
    btn.title = dark ? '现在是夜，点一下换成昼' : '现在是昼，点一下换成夜';
  };
  btn.addEventListener('click', () => { toggleTheme(); btn.blur(); });
  onTheme(sync);
  followSystem();
  sync();
}

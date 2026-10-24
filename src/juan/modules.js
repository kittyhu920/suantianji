// 各卷的模块（仪式页用）。静态引入：卷里的样式（含 Svelte 组件自带的 <style>）要一并进入页面的样式表，
// 否则 ClientRouter 换页时，动态加载的样式表会被当作旧页面的东西清掉。
// 新增一卷：在这里加一行（注册表见 ./index.js）。
import qian from './qian/index.js';
import gua from './gua/index.js';
import bu from './bu/index.js';

export const modules = { qian, gua, bu };

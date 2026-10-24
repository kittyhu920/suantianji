// 页码、步骤序号：汉字数字（一、二……十一、二十）。

const D = '零一二三四五六七八九';

export function cn(n) {
  if (n < 10) return D[n];
  if (n < 20) return `十${n % 10 ? D[n % 10] : ''}`;
  if (n < 100) return `${D[Math.floor(n / 10)]}十${n % 10 ? D[n % 10] : ''}`;
  return String(n);
}

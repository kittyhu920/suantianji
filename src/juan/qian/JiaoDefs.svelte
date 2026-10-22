<!-- 共享图形：筊杯两面（红漆月牙木片，平面与凸面） -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="lacquer-flat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b3302a"/>
      <stop offset="1" stop-color="#8a1c17"/>
    </linearGradient>
    <radialGradient id="lacquer-tu" cx="50%" cy="85%" r="75%">
      <stop offset="0" stop-color="#e0574a"/>
      <stop offset=".45" stop-color="#b52a22"/>
      <stop offset="1" stop-color="#5e0f0b"/>
    </radialGradient>
    <filter id="lacquer-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="2.2 .35" numOctaves="2" seed="3"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .35 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <path id="jiao-shape" d="M4 54 C4 14 36 4 60 4 C84 4 116 14 116 54 C96 46 24 46 4 54Z"/>
    <!-- 平面朝上：凸面着地，看上去像一只碗，顶上露出一块平整的漆面 -->
    <symbol id="jiao-ping" viewBox="0 0 120 60">
      <path d="M4 18 C4 46 34 57 60 57 C86 57 116 46 116 18 Z" fill="url(#lacquer-tu)"/>
      <path d="M4 18 C4 46 34 57 60 57 C86 57 116 46 116 18 Z" fill="#000" filter="url(#lacquer-grain)" opacity=".5"/>
      <path d="M4 18 C24 7 96 7 116 18 C96 28 24 28 4 18Z" fill="#d9644c"/>
      <path d="M4 18 C24 7 96 7 116 18 C96 28 24 28 4 18Z" fill="none" stroke="#f3b79a" stroke-opacity=".7" stroke-width="1.4"/>
      <path d="M22 17 C44 11 76 11 98 17" fill="none" stroke="#ffe2d2" stroke-opacity=".35" stroke-width="1"/>
    </symbol>
    <!-- 凸面朝上：鼓起的漆面，一道高光 -->
    <symbol id="jiao-tu" viewBox="0 0 120 60">
      <use href="#jiao-shape" fill="url(#lacquer-tu)"/>
      <use href="#jiao-shape" fill="#000" filter="url(#lacquer-grain)" opacity=".6"/>
      <path d="M22 30 C28 16 48 11 66 12" fill="none" stroke="#ffd9c8" stroke-opacity=".6" stroke-width="4" stroke-linecap="round"/>
      <use href="#jiao-shape" fill="none" stroke="#3a0806" stroke-opacity=".5" stroke-width="1.2"/>
    </symbol>
  </defs>
</svg>

<!-- 卜卷的共享图形：粗糙边缘（龟甲）、笔画的毛边（手绘字形）、刀刻的痕（刻辞）。滤镜只在绘制时算一次。 -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <filter id="bu-rough" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency=".07" numOctaves="2" seed="3" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <filter id="bu-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12" /></filter>
    <filter id="bu-brush" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="11" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <filter id="bu-carve" x="-10%" y="-4%" width="120%" height="108%">
      <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="5" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.3" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </defs>
</svg>

// 摇动控制（docs/DESIGN.md §6）：器物本身就是控件。
// 手机加速度计为主输入；回落为按住器物左右拖、按住不动让它自己摇、键盘按住空格或回车。
//
//   const shake = createShake(ctx, { tube, active, onTry })
//   tube()    返回当前的器物（createQian 的返回值），没有就返回 null
//   active()  现在是否允许摇（例如签已落下就不再摇）
//   onTry()   玩家又开始了一次尝试（按下一次、或一阵晃动）
//   shake.bind(button)  把指针与键盘事件接到器物按钮上，返回解除函数
//   shake.motion        'unknown' | 'asking' | 'granted' | 'denied'
//   shake.holding       是否正按住
//   shake.hasMotion     设备是否像手机（有动作传感器且是触屏）

export function createShake(ctx, { tube, active, onTry }) {
  const hasMotion = typeof DeviceMotionEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const st = $state({ motion: 'unknown', holding: false });
  let burst = 0;

  function holdStart(clientX) {
    const t = tube();
    if (st.holding || !t || !active()) return;
    if (!t.press(clientX)) return;
    st.holding = true;
    onTry();
    ctx.touch();
  }
  function holdEnd() {
    if (!st.holding) return;
    st.holding = false;
    tube()?.release();
    ctx.touch();
  }

  // 手机晃动：iOS（以及新版 Chrome）要求在真实的点击里申请"动作与方向"权限，
  // 所以点"问"字印章时就申请；被拒绝时，下次点签筒还会再试一次。
  function onMotion(e) {
    const t = tube();
    if (!t || !active()) return;
    t.motion(e);
    // 一阵晃动记为一次尝试
    const was = burst > 0;
    burst = t.active ? 30 : Math.max(0, burst - 1);
    if (!was && burst > 0 && !st.holding) { onTry(); ctx.touch(); }
    if (t.active) ctx.touch();
  }
  function requestMotion() {
    if (typeof DeviceMotionEvent === 'undefined' || st.motion === 'granted' || st.motion === 'asking') return;
    const listen = () => {
      st.motion = 'granted';
      window.addEventListener('devicemotion', onMotion);
    };
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      st.motion = 'asking';
      DeviceMotionEvent.requestPermission()
        .then((r) => { if (r === 'granted') listen(); else st.motion = 'denied'; })
        .catch(() => { st.motion = 'denied'; });
    } else listen();
  }
  // 安卓等无需授权的设备，进入页面就开始监听晃动
  if (hasMotion && typeof DeviceMotionEvent.requestPermission !== 'function') requestMotion();

  function bind(button) {
    const down = (e) => {
      e.preventDefault();
      button.setPointerCapture?.(e.pointerId);
      requestMotion();
      holdStart(e.clientX);
    };
    const move = (e) => { if (st.holding) tube()?.move(e.clientX); };
    const ctxm = (e) => e.preventDefault();
    // 键盘：按住空格或回车，等同于按住不动
    const kd = (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdStart(null); } };
    const ku = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); holdEnd(); } };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointermove', move);
    button.addEventListener('pointerup', holdEnd);
    button.addEventListener('pointercancel', holdEnd);
    button.addEventListener('contextmenu', ctxm);
    button.addEventListener('keydown', kd);
    button.addEventListener('keyup', ku);
    return () => {
      button.removeEventListener('pointerdown', down);
      button.removeEventListener('pointermove', move);
      button.removeEventListener('pointerup', holdEnd);
      button.removeEventListener('pointercancel', holdEnd);
      button.removeEventListener('contextmenu', ctxm);
      button.removeEventListener('keydown', kd);
      button.removeEventListener('keyup', ku);
    };
  }

  return {
    bind,
    requestMotion,
    holdEnd,
    hasMotion,
    get motion() { return st.motion; },
    get holding() { return st.holding; },
    destroy() { window.removeEventListener('devicemotion', onMotion); },
  };
}

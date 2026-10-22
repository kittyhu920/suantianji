<script>
  // Astro 页面挂载的入口：把卦卷交给公共层的仪式外壳（岛的属性必须可序列化，所以卷在这里引入）
  import Ritual from '../../core/Ritual.svelte';
  import juan from './index.js';
  import '../qian/qian.css';
  import '../qian/fit.css';
  import './gua.css';
</script>

<Ritual {juan} />

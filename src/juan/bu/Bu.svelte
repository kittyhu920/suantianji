<script>
  // Astro 页面挂载的入口：把卜卷交给公共层的仪式外壳（岛的属性必须可序列化，所以卷在这里引入）
  import Ritual from '../../core/Ritual.svelte';
  import juan from './index.js';
  import './bu.css';
</script>

<Ritual {juan} />

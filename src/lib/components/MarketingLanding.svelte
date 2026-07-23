<script lang="ts">
  import Logo from "./Logo.svelte";

  let { onEnter }: { onEnter: () => void } = $props();

  const capabilities = [
    { value: "01", label: "Vende", text: "TPV ágil, tickets y caja en un mismo ritmo." },
    { value: "02", label: "Entiende", text: "Clientes, márgenes e IVA sin hojas dispersas." },
    { value: "03", label: "Anticipa", text: "Stock y reposición guiados por datos reales." },
  ];
</script>

<svelte:head>
  <title>Hexa · Tu tienda, bajo control</title>
  <meta name="description" content="CRM local para vender, conocer a tus clientes y decidir mejor cada día." />
</svelte:head>

<div class="landing-shell">
  <section class="landing-hero" aria-labelledby="landing-title">
    <img class="landing-hero-image" src="/crm-hero-v1.webp" alt="Mostrador de una tienda independiente al anochecer" width="1672" height="941" fetchpriority="high" />
    <div class="landing-hero-scrim"></div>

    <div class="landing-topline">
      <span>CRM local-first</span><i></i><span>Datos en tu negocio</span><i></i><span>IA opcional</span>
    </div>

    <header class="landing-nav">
      <a href="#inicio" class="landing-brand" aria-label="Hexa, inicio">
        <Logo size={34} />
        <span>HEXA <b>CRM</b></span>
      </a>
      <nav aria-label="Navegación de presentación">
        <a href="#criterio">El sistema</a>
        <a href="#capacidades">Capacidades</a>
        <a href="#privacidad">Privacidad</a>
      </nav>
      <button type="button" class="landing-nav-cta" onclick={onEnter}>Entrar al CRM <span>↗</span></button>
    </header>

    <div class="landing-copy" id="inicio">
      <p class="landing-kicker"><span>01</span> GESTIÓN DE COMERCIO · LOCAL</p>
      <h1 id="landing-title">Tu tienda<br />bajo <em>control.</em></h1>
      <p class="landing-lede">Un CRM sereno para vender, conocer a tus clientes y tomar la siguiente decisión con claridad.</p>
      <div class="landing-actions">
        <button type="button" class="landing-primary" onclick={onEnter}>Abrir mi espacio <span>↗</span></button>
        <a href="#criterio" class="landing-secondary">Descubre el sistema <span>↓</span></a>
      </div>
      <div class="landing-proof"><span>Operativa local</span><i></i><span>IVA español</span><i></i><span>Sin nube obligatoria</span></div>
    </div>

    <a class="landing-scroll" href="#criterio"><span></span> DESPLAZA PARA EXPLORAR</a>
  </section>

  <section class="landing-manifesto" id="criterio">
    <p class="landing-kicker"><span>02</span> UNA SOLA LECTURA DEL NEGOCIO</p>
    <div>
      <h2>Menos paneles.<br /><em>Más criterio.</em></h2>
      <p>Hexa conecta cada venta con el stock, la caja y la relación con tus clientes. Lo importante aparece primero; el detalle sigue ahí cuando lo necesitas.</p>
    </div>
  </section>

  <section class="landing-capabilities" id="capacidades">
    {#each capabilities as item}
      <article>
        <span>{item.value}</span>
        <h3>{item.label}</h3>
        <p>{item.text}</p>
        <span class="capability-arrow">↗</span>
      </article>
    {/each}
  </section>

  <section class="landing-closing" id="privacidad">
    <div>
      <p class="landing-kicker"><span>03</span> TECNOLOGÍA CON LÍMITES CLAROS</p>
      <h2>Tu negocio.<br /><em>Tus datos.</em></h2>
    </div>
    <div class="landing-closing-copy">
      <p>Funciona localmente y la inteligencia artificial es opcional. Sin convertir la operativa cotidiana de tu tienda en el producto de otra empresa.</p>
      <button type="button" class="landing-primary" onclick={onEnter}>Entrar a Hexa <span>↗</span></button>
    </div>
  </section>

  <footer class="landing-footer"><span>HEXA CRM</span><span>Gestión de tienda, con otra calma.</span><span>© {new Date().getFullYear()}</span></footer>
</div>

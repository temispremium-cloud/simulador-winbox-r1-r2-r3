export const GUIDE_FULL = {
  title: "Guía Paso a Paso en Winbox: R1, R2 y R3",
  subtitle: "Configuración sencilla y directa por interfaz gráfica WinBox para examen y prácticas de laboratorio.",
  cablesNotes: "Switch a R1 ether1 | R1 ether2 con R2 ether2 | R1 ether3 con R3 ether2 | R2 ether3 con R3 ether3 | PC al ether4 del router que se configura.",
  
  winboxSteps: {
    R1: [
      { text: "System → Identity → R1 → OK.", ip: "" },
      { text: "IP → Addresses → +: 172.16.12.1/24 en ether2 → OK.", ip: "172.16.12.1/24" },
      { text: "IP → Addresses → +: 172.16.13.1/24 en ether3 → OK.", ip: "172.16.13.1/24" },
      { text: "IP → Addresses → +: 192.168.10.1/24 en ether4 → OK.", ip: "192.168.10.1/24" },
      { text: "IP → DHCP Client → +: Interface ether1 → OK. Debe decir bound.", ip: "" },
      { text: "IP → Firewall → pestaña NAT → +: Chain srcnat, Out. Interface ether1. Pestaña Action: masquerade → OK.", ip: "" },
      { text: "IP → DNS → Settings: Servers 8.8.8.8, marca Allow Remote Requests → OK.", ip: "8.8.8.8" },
      { text: "IP → Routes → +: Dst. Address 172.16.23.0/24, Gateway 172.16.12.2 → OK.", ip: "172.16.23.0/24" },
      { text: "Tools → Ping: 1.1.1.1 → Start. Debe responder. Toma captura y pulsa Stop.", ip: "1.1.1.1" },
      { text: "Con el triángulo armado: Tools → Ping: 172.16.23.3 → Start. Debe responder. Toma captura y pulsa Stop.", ip: "172.16.23.3" },
      { text: "En la PC (cable en el ether4 de R1, Wi-Fi apagado): Win + R → ncpa.cpl → Ethernet → Propiedades → Protocolo de Internet versión 4 → Propiedades → Usar la siguiente dirección IP.", ip: "" },
      { text: "IP 192.168.10.2, máscara 255.255.255.0, puerta de enlace 192.168.10.1 y DNS preferido 8.8.8.8 → Aceptar.", ip: "192.168.10.2" },
      { text: "En cmd: ping 192.168.10.1 y ping 1.1.1.1. Los dos deben responder.", ip: "" },
      { text: "Abre el navegador y busca 'yuca'. Si abre, la PC tiene Internet por R1. Toma captura.", ip: "" },
      { text: "Al terminar, vuelve el adaptador a Obtener una dirección IP automáticamente.", ip: "" }
    ],
    R2: [
      { text: "System → Identity → R2 → OK.", ip: "" },
      { text: "IP → Addresses → +: 172.16.12.2/24 en ether2 → OK.", ip: "172.16.12.2/24" },
      { text: "IP → Addresses → +: 172.16.23.2/24 en ether3 → OK.", ip: "172.16.23.2/24" },
      { text: "IP → Routes → +: Dst. Address 172.16.13.0/24, Gateway 172.16.12.1 → OK.", ip: "172.16.13.0/24" },
      { text: "IP → Routes → +: Dst. Address 0.0.0.0/0, Gateway 172.16.12.1 → OK.", ip: "0.0.0.0/0" },
      { text: "Tools → Ping: 1.1.1.1 → Start. Debe responder. Toma captura y pulsa Stop.", ip: "1.1.1.1" },
      { text: "Con el triángulo armado: Tools → Ping: 172.16.13.3 → Start. Debe responder. Toma captura y pulsa Stop.", ip: "172.16.13.3" }
    ],
    R3: [
      { text: "System → Identity → R3 → OK.", ip: "" },
      { text: "IP → Addresses → +: 172.16.13.3/24 en ether2 → OK.", ip: "172.16.13.3/24" },
      { text: "IP → Addresses → +: 172.16.23.3/24 en ether3 → OK.", ip: "172.16.23.3/24" },
      { text: "IP → Routes → +: Dst. Address 172.16.12.0/24, Gateway 172.16.13.1 → OK.", ip: "172.16.12.0/24" },
      { text: "IP → Routes → +: Dst. Address 0.0.0.0/0, Gateway 172.16.13.1 → OK.", ip: "0.0.0.0/0" },
      { text: "Tools → Ping: 1.1.1.1 → Start. Debe responder. Toma captura y pulsa Stop.", ip: "1.1.1.1" },
      { text: "Con el triángulo armado: Tools → Ping: 172.16.12.2 → Start. Debe responder. Toma captura y pulsa Stop.", ip: "172.16.12.2" }
    ]
  },

  step1Reset: `/system reset-configuration no-defaults=yes skip-backup=yes`,
  step2R1: `/system identity set name=R1
/ip address add address=172.16.12.1/24 interface=ether2
/ip address add address=172.16.13.1/24 interface=ether3
/ip address add address=192.168.10.1/24 interface=ether4
/ip dhcp-client add interface=ether1 disabled=no add-default-route=yes
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade
/ip dns set servers=8.8.8.8 allow-remote-requests=yes
/ip route add dst-address=172.16.23.0/24 gateway=172.16.12.2 distance=1
/ip route add dst-address=172.16.23.0/24 gateway=172.16.13.3 distance=2
/ip route add dst-address=192.168.20.0/24 gateway=172.16.12.2 distance=1
/ip route add dst-address=192.168.20.0/24 gateway=172.16.13.3 distance=2
/ip route add dst-address=192.168.30.0/24 gateway=172.16.13.3 distance=1
/ip route add dst-address=192.168.30.0/24 gateway=172.16.12.2 distance=2`,

  step3R2: `/system identity set name=R2
/ip address add address=172.16.12.2/24 interface=ether2
/ip address add address=172.16.23.2/24 interface=ether3
/ip address add address=192.168.20.1/24 interface=ether4
/ip dns set servers=8.8.8.8
/ip route add dst-address=0.0.0.0/0 gateway=172.16.12.1 distance=1
/ip route add dst-address=172.16.13.0/24 gateway=172.16.12.1 distance=1
/ip route add dst-address=0.0.0.0/0 gateway=172.16.23.3 distance=2
/ip route add dst-address=172.16.13.0/24 gateway=172.16.23.3 distance=2
/ip route add dst-address=192.168.30.0/24 gateway=172.16.23.3 distance=1`,

  step4R3: `/system identity set name=R3
/ip address add address=172.16.13.3/24 interface=ether2
/ip address add address=172.16.23.3/24 interface=ether3
/ip address add address=192.168.30.1/24 interface=ether4
/ip dns set servers=8.8.8.8
/ip route add dst-address=0.0.0.0/0 gateway=172.16.13.1 distance=1
/ip route add dst-address=172.16.12.0/24 gateway=172.16.13.1 distance=1
/ip route add dst-address=0.0.0.0/0 gateway=172.16.23.2 distance=2
/ip route add dst-address=172.16.12.0/24 gateway=172.16.23.2 distance=2
/ip route add dst-address=192.168.20.0/24 gateway=172.16.23.2 distance=1`,

  verifyR1: `/ip dhcp-client print
/ip firewall nat print
/ip route print
/ping 1.1.1.1 count=5
/ping google.com count=3
/ping 172.16.23.2 count=3
/ping 172.16.23.3 count=3
/ping 192.168.20.1 count=3
/ping 192.168.30.1 count=3`,

  verifyR2: `/ip route print
/ping 172.16.12.1 count=3
/ping 172.16.13.3 count=3
/ping 192.168.10.1 count=3
/ping 192.168.30.1 count=3
/ping 1.1.1.1 count=5
/ping google.com count=3
/tool traceroute 1.1.1.1`,

  verifyR3: `/ip route print
/ping 172.16.13.1 count=3
/ping 172.16.12.2 count=3
/ping 192.168.10.1 count=3
/ping 192.168.20.1 count=3
/ping 1.1.1.1 count=5
/ping google.com count=3
/tool traceroute 1.1.1.1`,

  failoverTest: `/ping 1.1.1.1 count=10
/tool traceroute 1.1.1.1`,

  pcTable: [
    { router: "R1", ip: "192.168.10.2", mask: "255.255.255.0", gw: "192.168.10.1", dns: "8.8.8.8" },
    { router: "R2", ip: "192.168.20.2", mask: "255.255.255.0", gw: "192.168.20.1", dns: "8.8.8.8" },
    { router: "R3", ip: "192.168.30.2", mask: "255.255.255.0", gw: "192.168.30.1", dns: "8.8.8.8" }
  ]
};

/**
 * Downloads a clean printable / PDF format of the Winbox step-by-step guide.
 * Guarantees strict page separation so R1 is on Page 1, R2 on Page 2, and R3 is strictly on Page 3.
 */
export function printWinboxGuidePdf(targetRouter?: string) {
  const g = GUIDE_FULL;

  const highlightKeywords = (str: string) => {
    return str
      .replace(/(\bOK\b|\bAceptar\b|\bStart\b|\bStop\b)/g, '<b>$1</b>')
      .replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?)/g, '<code class="code-ip">$1</code>')
      .replace(/(ether\d)/g, '<code class="code-if">$1</code>');
  };

  const renderStepsList = (rName: 'R1' | 'R2' | 'R3') => {
    const steps = g.winboxSteps[rName];
    return `
      <ol class="step-list">
        ${steps.map((st, idx) => `
          <li>
            <span class="chk-box"></span>
            <span class="step-num">${idx + 1}</span>
            <span class="step-desc">${highlightKeywords(st.text)}</span>
          </li>
        `).join('')}
      </ol>
    `;
  };

  const renderPcTable = () => `
    <div class="table-wrap">
      <div class="section-title">Tabla de direccionamiento IP para la PC (Prueba en ether4)</div>
      <table>
        <thead>
          <tr>
            <th>Cable en ether4 de</th>
            <th>IP fija de la PC</th>
            <th>Máscara</th>
            <th>Puerta de enlace</th>
            <th>DNS preferido</th>
          </tr>
        </thead>
        <tbody>
          ${g.pcTable.map(r => `
            <tr>
              <td><b>${r.router}</b></td>
              <td><code class="code-ip">${r.ip}</code></td>
              <td>${r.mask}</td>
              <td><code class="code-ip">${r.gw}</code></td>
              <td>${r.dns}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Builds page HTML
  let pagesHtml = '';

  if (targetRouter === 'R1') {
    pagesHtml = `
      <div class="sheet-page">
        <div class="header-box">
          <div class="badge">GUÍA OFICIAL WINBOX</div>
          <h1>Configuración Paso a Paso: Router 1 (R1)</h1>
          <div class="sub">${g.subtitle}</div>
        </div>
        <div class="note">
          <b>Regla clave:</b> Pulsa <b>OK</b> en cada ventana para guardar los cambios. El cable del ISP/Internet va en <code>ether1</code> y la PC en <code>ether4</code>.
        </div>
        <div class="router-title">Pasos de configuración para R1 en Winbox</div>
        ${renderStepsList('R1')}
        ${renderPcTable()}
        <div class="footer">Página 1 de 1 · Router 1 (R1) · Práctica y examen de redes MikroTik RouterOS</div>
      </div>
    `;
  } else if (targetRouter === 'R2') {
    pagesHtml = `
      <div class="sheet-page">
        <div class="header-box">
          <div class="badge">GUÍA OFICIAL WINBOX</div>
          <h1>Configuración Paso a Paso: Router 2 (R2)</h1>
          <div class="sub">${g.subtitle}</div>
        </div>
        <div class="note">
          <b>Regla clave:</b> Pulsa <b>OK</b> en cada ventana. R2 se conecta con R1 por <code>ether2</code> y con R3 por <code>ether3</code>.
        </div>
        <div class="router-title">Pasos de configuración para R2 en Winbox</div>
        ${renderStepsList('R2')}
        <div class="note" style="margin-top: 14px;">
          <b>Comprobación rápida en Terminal de R2:</b>
          <div style="font-family: monospace; font-size: 8.5pt; margin-top: 4px; line-height: 1.4;">
            /ping 172.16.12.1 count=3 &nbsp;|&nbsp; /ping 1.1.1.1 count=3 &nbsp;|&nbsp; /tool traceroute 1.1.1.1
          </div>
        </div>
        ${renderPcTable()}
        <div class="footer">Página 1 de 1 · Router 2 (R2) · Práctica y examen de redes MikroTik RouterOS</div>
      </div>
    `;
  } else if (targetRouter === 'R3') {
    pagesHtml = `
      <div class="sheet-page">
        <div class="header-box">
          <div class="badge">GUÍA OFICIAL WINBOX</div>
          <h1>Configuración Paso a Paso: Router 3 (R3)</h1>
          <div class="sub">${g.subtitle}</div>
        </div>
        <div class="note">
          <b>Regla clave:</b> Pulsa <b>OK</b> en cada ventana. R3 se conecta con R1 por <code>ether2</code> y con R2 por <code>ether3</code>.
        </div>
        <div class="router-title">Pasos de configuración para R3 en Winbox</div>
        ${renderStepsList('R3')}
        <div class="note" style="margin-top: 14px;">
          <b>Comprobación rápida en Terminal de R3:</b>
          <div style="font-family: monospace; font-size: 8.5pt; margin-top: 4px; line-height: 1.4;">
            /ping 172.16.13.1 count=3 &nbsp;|&nbsp; /ping 1.1.1.1 count=3 &nbsp;|&nbsp; /tool traceroute 1.1.1.1
          </div>
        </div>
        ${renderPcTable()}
        <div class="footer">Página 1 de 1 · Router 3 (R3) · Práctica y examen de redes MikroTik RouterOS</div>
      </div>
    `;
  } else {
    // FULL GUIDE: Exact 3-page layout.
    // Page 1: R1
    // Page 2: R2
    // Page 3: R3 (Strictly on Page 3, never split!)
    pagesHtml = `
      <!-- ================= PÁGINA 1: ROUTER 1 (R1) ================= -->
      <div class="sheet-page page-1">
        <div class="header-box">
          <div class="badge">GUÍA OFICIAL DE ESTUDIO · WINBOX</div>
          <h1>Guía de Laboratorio: Router 1 (R1)</h1>
          <div class="sub">${g.subtitle}</div>
        </div>
        <div class="note">
          <b>Cables:</b> Switch a <code>R1 ether1</code> | <code>R1 ether2</code> con <code>R2 ether2</code> | <code>R1 ether3</code> con <code>R3 ether2</code>. PC en <code>ether4</code>.<br/>
          <b>Regla:</b> Pulsa <b>OK</b> en cada ventana: si la dejas abierta, no se guarda.
        </div>
        <div class="router-title">1. Configuración de R1 en Winbox</div>
        ${renderStepsList('R1')}
        <div class="footer">Página 1 de 3 · Configuración de R1 · Guía de Laboratorio MikroTik</div>
      </div>

      <!-- ================= PÁGINA 2: ROUTER 2 (R2) ================= -->
      <div class="sheet-page page-2">
        <div class="header-box">
          <div class="badge">GUÍA OFICIAL DE ESTUDIO · WINBOX</div>
          <h1>Guía de Laboratorio: Router 2 (R2)</h1>
          <div class="sub">Configuración de interfaz gráfica en WinBox y rutas por defecto</div>
        </div>
        <div class="note">
          <b>Cables de R2:</b> <code>ether2</code> conectado a <code>R1 ether2</code> (red 172.16.12.0/24) | <code>ether3</code> conectado a <code>R3 ether3</code> (red 172.16.23.0/24).
        </div>
        <div class="router-title">2. Configuración de R2 en Winbox</div>
        ${renderStepsList('R2')}
        
        <div class="extra-box">
          <div class="section-title">Comprobación de conectividad en Terminal de R2</div>
          <p style="margin: 3px 0 6px; font-size: 9pt;">Ejecuta estos comandos en <b>New Terminal</b> de R2 para comprobar que todo está listo:</p>
          <pre><code>/ping 172.16.12.1 count=3
/ping 172.16.13.3 count=3
/ping 1.1.1.1 count=5
/tool traceroute 1.1.1.1</code></pre>
          <p style="margin: 6px 0 0; font-size: 8.5pt; color: #445;">Debe responder con 0% de pérdida de paquetes hacia 1.1.1.1.</p>
        </div>

        <div class="footer">Página 2 de 3 · Configuración de R2 · Guía de Laboratorio MikroTik</div>
      </div>

      <!-- ================= PÁGINA 3: ROUTER 3 (R3) (ESTRICTAMENTE EN PÁGINA 3) ================= -->
      <div class="sheet-page page-3">
        <div class="header-box">
          <div class="badge">GUÍA OFICIAL DE ESTUDIO · WINBOX</div>
          <h1>Guía de Laboratorio: Router 3 (R3)</h1>
          <div class="sub">Configuración de interfaz gráfica en WinBox y pruebas finales de red</div>
        </div>
        <div class="note">
          <b>Cables de R3:</b> <code>ether2</code> conectado a <code>R1 ether3</code> (red 172.16.13.0/24) | <code>ether3</code> conectado a <code>R2 ether3</code> (red 172.16.23.0/24).
        </div>
        <div class="router-title">3. Configuración de R3 en Winbox</div>
        ${renderStepsList('R3')}

        ${renderPcTable()}

        <div class="extra-box" style="margin-top: 10px;">
          <div class="section-title">Prueba de Redundancia y Conmutación (Failover)</div>
          <p style="margin: 3px 0; font-size: 8.5pt;">
            Al desconectar o cortar el cable entre R1 y R2, el tráfico debe conmutar automáticamente a través de R3 (salto por <code>172.16.23.3</code>) gracias a la ruta con <code>distance=2</code>.
          </p>
        </div>

        <div class="footer">Página 3 de 3 · Configuración de R3 y pruebas finales · Guía de Laboratorio MikroTik</div>
      </div>
    `;
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Guía Oficial Winbox - R1, R2 y R3</title>
<style>
  @page {
    size: A4 portrait;
    margin: 1.2cm 1.4cm;
  }
  * {
    box-sizing: border-box;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a2420;
    background: #fff;
    line-height: 1.4;
    font-size: 10pt;
    margin: 0;
    padding: 0;
  }
  .sheet-page {
    page-break-after: always;
    break-after: page;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-height: 25.8cm;
    padding-bottom: 0.5cm;
    justify-content: flex-start;
  }
  .sheet-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .header-box {
    border-bottom: 2px solid #1f6f4a;
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  .badge {
    display: inline-block;
    background: #1f6f4a;
    color: #fff;
    font-size: 7.5pt;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  h1 {
    font-size: 15pt;
    margin: 2px 0 3px;
    color: #143825;
  }
  .sub {
    font-size: 9pt;
    color: #4a5950;
    margin: 0;
  }
  .note {
    background: #f0f7f3;
    border-left: 3.5px solid #1f6f4a;
    padding: 6px 10px;
    font-size: 8.5pt;
    color: #274233;
    margin: 6px 0 10px;
    border-radius: 0 4px 4px 0;
  }
  .router-title {
    font-size: 11.5pt;
    font-weight: 700;
    margin: 8px 0 6px;
    color: #1f6f4a;
    border-bottom: 1px solid #d5ded8;
    padding-bottom: 3px;
    page-break-after: avoid;
  }
  .section-title {
    font-size: 9.5pt;
    font-weight: 700;
    color: #1f6f4a;
    margin-bottom: 4px;
  }
  .step-list {
    list-style: none;
    padding: 0;
    margin: 0 0 8px;
  }
  .step-list li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 3.5px 0;
    border-bottom: 1px dashed #e1e7e3;
    page-break-inside: avoid;
  }
  .chk-box {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid #1f6f4a;
    border-radius: 3px;
    margin-top: 2px;
    flex-shrink: 0;
  }
  .step-num {
    font-weight: 700;
    color: #1f6f4a;
    min-width: 18px;
    font-size: 9pt;
    text-align: right;
    margin-top: 1px;
    flex-shrink: 0;
  }
  .step-desc {
    flex: 1;
    font-size: 9.5pt;
  }
  .code-ip {
    background: #eef5f1;
    border: 1px solid #1f6f4a;
    padding: 0 3px;
    border-radius: 3px;
    font-family: ui-monospace, Consolas, monospace;
    font-weight: 600;
    color: #0f3d27;
    font-size: 8.5pt;
  }
  .code-if {
    background: #f2f3f5;
    border: 1px solid #c9d1cc;
    padding: 0 3px;
    border-radius: 3px;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 8.5pt;
  }
  .table-wrap {
    margin-top: 10px;
    page-break-inside: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 0;
    font-size: 8.5pt;
  }
  th, td {
    border: 1px solid #c8d4cc;
    padding: 4px 7px;
    text-align: left;
  }
  th {
    background: #edf4ef;
    font-weight: 600;
    color: #1f4a35;
  }
  .extra-box {
    background: #fcfdfc;
    border: 1px solid #d5ded8;
    border-radius: 4px;
    padding: 8px 10px;
    margin-top: 10px;
    page-break-inside: avoid;
  }
  pre {
    background: #1e2429;
    color: #e6edf3;
    padding: 6px 8px;
    border-radius: 4px;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 8pt;
    margin: 4px 0 0;
    line-height: 1.35;
  }
  .footer {
    margin-top: auto;
    border-top: 1px solid #e1e7e3;
    padding-top: 5px;
    font-size: 7.5pt;
    color: #728277;
    text-align: center;
  }
  @media screen {
    body {
      background: #e5eaef;
      padding: 20px;
    }
    .sheet-page {
      background: #fff;
      max-width: 21cm;
      margin: 0 auto 20px;
      padding: 1.5cm;
      box-shadow: 0 4px 14px rgba(0,0,0,0.12);
      border-radius: 6px;
    }
  }
</style>
</head>
<body>
  ${pagesHtml}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 350);
    };
  </script>
</body>
</html>`;

  // Printing mechanism: attempt hidden iframe first to avoid popup blockers, fallback to window.open
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    iframe.contentWindow?.document.open();
    iframe.contentWindow?.document.write(fullHtml);
    iframe.contentWindow?.document.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        // Fallback to window.open if iframe printing was blocked
        const w = window.open('', '_blank');
        if (w) {
          w.document.open();
          w.document.write(fullHtml);
          w.document.close();
        }
      }
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch (e) {}
      }, 2000);
    }, 400);
  } catch (e) {
    const w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(fullHtml);
      w.document.close();
    }
  }
}

/**
 * Downloads a .rsc script file directly for MikroTik RouterOS
 */
export function downloadRouterScript(routerName: string, scriptContent: string) {
  const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `config_${routerName}.rsc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
 * Downloads a clean printable / PDF format of the Winbox step-by-step guide
 */
export function printWinboxGuidePdf(targetRouter?: string) {
  const g = GUIDE_FULL;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes en tu navegador para generar el PDF.');
    return;
  }

  const renderStepsHtml = (rName: 'R1' | 'R2' | 'R3') => {
    const steps = g.winboxSteps[rName];
    return `
      <div class="router-section">
        <h3>Configuración de ${rName} en Winbox</h3>
        <ol class="step-list">
          ${steps.map((st, idx) => `
            <li>
              <span class="chk-box"></span>
              <span class="step-num">${idx + 1}</span>
              <span class="step-desc">${highlightKeywords(st.text)}</span>
            </li>
          `).join('')}
        </ol>
      </div>
    `;
  };

  const highlightKeywords = (str: string) => {
    return str
      .replace(/(\bOK\b|\bAceptar\b|\bStart\b|\bStop\b)/g, '<b>$1</b>')
      .replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?)/g, '<code class="code-ip">$1</code>')
      .replace(/(ether\d)/g, '<code class="code-if">$1</code>');
  };

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Guía Paso a Paso Winbox - R1, R2 y R3</title>
<style>
  @page {
    size: A4 portrait;
    margin: 1.2cm 1.4cm;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a2420;
    background: #fff;
    line-height: 1.45;
    font-size: 10.5pt;
    margin: 0;
    padding: 0;
  }
  .header-box {
    border-bottom: 2px solid #1f6f4a;
    padding-bottom: 6px;
    margin-bottom: 12px;
  }
  h1 {
    font-size: 16pt;
    margin: 0 0 4px;
    color: #143825;
  }
  .sub {
    font-size: 9.5pt;
    color: #4a5950;
    margin: 0 0 6px;
  }
  .note {
    background: #f0f7f3;
    border-left: 3px solid #1f6f4a;
    padding: 6px 10px;
    font-size: 9pt;
    color: #274233;
    margin: 8px 0;
  }
  h3 {
    font-size: 12pt;
    margin: 14px 0 6px;
    color: #1f6f4a;
    border-bottom: 1px solid #d5ded8;
    padding-bottom: 3px;
    page-break-after: avoid;
  }
  .step-list {
    list-style: none;
    padding: 0;
    margin: 0 0 10px;
  }
  .step-list li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px dashed #e1e7e3;
    page-break-inside: avoid;
  }
  .chk-box {
    display: inline-block;
    width: 13px;
    height: 13px;
    border: 1.5px solid #1f6f4a;
    border-radius: 3px;
    margin-top: 2px;
    flex-shrink: 0;
  }
  .step-num {
    font-weight: 700;
    color: #1f6f4a;
    min-width: 18px;
    font-size: 9.5pt;
    text-align: right;
    margin-top: 1px;
    flex-shrink: 0;
  }
  .step-desc {
    flex: 1;
    font-size: 10pt;
  }
  .code-ip {
    background: #eef5f1;
    border: 1px solid #1f6f4a;
    padding: 0 4px;
    border-radius: 3px;
    font-family: ui-monospace, Consolas, monospace;
    font-weight: 600;
    color: #0f3d27;
  }
  .code-if {
    background: #f2f3f5;
    border: 1px solid #c9d1cc;
    padding: 0 4px;
    border-radius: 3px;
    font-family: ui-monospace, Consolas, monospace;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #c8d4cc;
    padding: 5px 8px;
    text-align: left;
  }
  th {
    background: #edf4ef;
    font-weight: 600;
  }
  .footer {
    margin-top: 16px;
    border-top: 1px solid #e1e7e3;
    padding-top: 6px;
    font-size: 8pt;
    color: #728277;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="header-box">
    <h1>Alternativa: Configuración sencilla paso a paso en Winbox</h1>
    <div class="sub">Guía de laboratorio para R1, R2 y R3 · Instrucciones exactas de menús e interfaz gráfica</div>
  </div>

  <div class="note">
    <b>Regla importante:</b> Pulsa <b>OK</b> en cada ventana: si la dejas abierta, no se guarda. Con esta configuración, la PC tiene salida a Internet conectada al puerto <b>ether4 de R1</b>.
  </div>

  ${targetRouter === 'R2' ? renderStepsHtml('R2') : targetRouter === 'R3' ? renderStepsHtml('R3') : `
    ${renderStepsHtml('R1')}
    ${renderStepsHtml('R2')}
    ${renderStepsHtml('R3')}
  `}

  <h3>Tabla de direccionamiento IP para la PC (Prueba en ether4)</h3>
  <table>
    <thead>
      <tr>
        <th>Cable en ether4 de</th>
        <th>IP fija de la PC</th>
        <th>Máscara de subred</th>
        <th>Puerta de enlace</th>
        <th>Servidor DNS</th>
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

  <div class="footer">
    Documento oficial para estudiantes · Práctica y examen de redes MikroTik RouterOS
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 350);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
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

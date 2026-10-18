import React, { useEffect, useRef, useState, useTransition } from 'react';
import { GUIDE_FULL, printWinboxGuidePdf, downloadRouterScript } from './guideData';

// IP Math and helpers
const N = (ip: string) => ip.split('.').reduce((a, x) => a * 256 + +x, 0);
const V = (ip: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(x => +x < 256);
const inn = (ip: string, n: string, p: number) => p === 0 || (N(ip) >>> (32 - p)) === (N(n) >>> (32 - p));
const priv = (ip: string) => inn(ip, '10.0.0.0', 8) || inn(ip, '172.16.0.0', 12) || inn(ip, '192.168.0.0', 16);
const pa = (d: string) => {
  const [a, b] = d.split('/');
  const p = b === undefined ? 32 : +b;
  return V(a) && Number.isInteger(p) && p >= 0 && p <= 32 ? { a, p } : null;
};
const net = (a: string, p: number) => {
  const m = p ? ((N(a) >>> (32 - p)) << (32 - p)) >>> 0 : 0;
  return [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join('.');
};

interface AddressEntry {
  v: string;
  i: string;
  dyn?: number;
}

interface RouteEntry {
  d: string;
  g: string;
  dist: number;
  dyn?: number;
  on: boolean;
}

interface DhcpEntry {
  i: string;
  def: boolean;
}

interface NatEntry {
  chain: string;
  out: string;
  action: string;
}

interface RouterState {
  id: string;
  a: AddressEntry[];
  r: RouteEntry[];
  d: DhcpEntry[];
  n: NatEntry[];
  dns: string;
}

const mkRouter = (): RouterState => ({ id: 'MikroTik', a: [], r: [], d: [], n: [], dns: '' });

const MAC: Record<string, string> = {
  R1: 'CC:2D:E0:0B:34:A7',
  R2: 'D4:01:C3:B5:7B:DB',
  R3: '6C:3B:6B:17:EB:73',
};

const VER: Record<string, string> = {
  R1: 'v7.15.2',
  R2: 'v6.49.19',
  R3: 'v7.15.2',
};

const IFS = ['ether1', 'ether2', 'ether3', 'ether4'];

interface LinkDef {
  id: string;
  a: [string, string];
  b: [string, string];
}

const L: LinkDef[] = [
  { id: '12', a: ['R1', 'ether2'], b: ['R2', 'ether2'] },
  { id: '13', a: ['R1', 'ether3'], b: ['R3', 'ether2'] },
  { id: '23', a: ['R2', 'ether3'], b: ['R3', 'ether3'] },
  { id: 'net', a: ['R1', 'ether1'], b: ['NET', 'isp'] },
];

const CN: Record<string, [string, string]> = {
  '12': ['R1 ether2', 'R2 ether2'],
  '13': ['R1 ether3', 'R3 ether2'],
  '23': ['R2 ether3', 'R3 ether3'],
  net: ['R1 ether1', 'Switch / Internet'],
};

const G: Record<string, string> = {
  R1: `/system identity set name=R1
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
  R2: `/system identity set name=R2
/ip address add address=172.16.12.2/24 interface=ether2
/ip address add address=172.16.23.2/24 interface=ether3
/ip address add address=192.168.20.1/24 interface=ether4
/ip dns set servers=8.8.8.8
/ip route add dst-address=0.0.0.0/0 gateway=172.16.12.1 distance=1
/ip route add dst-address=172.16.13.0/24 gateway=172.16.12.1 distance=1
/ip route add dst-address=0.0.0.0/0 gateway=172.16.23.3 distance=2
/ip route add dst-address=172.16.13.0/24 gateway=172.16.23.3 distance=2
/ip route add dst-address=192.168.30.0/24 gateway=172.16.23.3 distance=1`,
  R3: `/system identity set name=R3
/ip address add address=172.16.13.3/24 interface=ether2
/ip address add address=172.16.23.3/24 interface=ether3
/ip address add address=192.168.30.1/24 interface=ether4
/ip dns set servers=8.8.8.8
/ip route add dst-address=0.0.0.0/0 gateway=172.16.13.1 distance=1
/ip route add dst-address=172.16.12.0/24 gateway=172.16.13.1 distance=1
/ip route add dst-address=0.0.0.0/0 gateway=172.16.23.2 distance=2
/ip route add dst-address=172.16.12.0/24 gateway=172.16.23.2 distance=2
/ip route add dst-address=192.168.20.0/24 gateway=172.16.23.2 distance=1`,
};

// SVG Icons dictionary for WinBox menu
const SVG_ICONS: Record<string, string> = {
  'Quick Set': '<path d="M2.5 13.5l8-8" stroke="#6b6b6b" stroke-width="2.2" stroke-linecap="round"/><path d="M12 1.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" fill="#f2b233"/>',
  CAPsMAN: '<circle cx="8" cy="8" r="6.5" fill="#7fb87f" stroke="#4a8a4a"/><path d="M8 12V7M5.5 5.5a3.5 3.5 0 0 1 5 0" stroke="#fff" stroke-width="1.4" fill="none"/>',
  Interfaces: '<rect x="2" y="4" width="12" height="8" rx="1" fill="#3a9a45" stroke="#25702e"/><path d="M4 4V2M7 4V2M10 4V2M13 4V2M4 14v-2M7 14v-2M10 14v-2" stroke="#555"/>',
  Wireless: '<path d="M8 14V8M5.2 5.2a4 4 0 0 1 5.6 0M3 3a7 7 0 0 1 10 0" stroke="#5a6b78" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  WireGuard: '<circle cx="8" cy="8" r="6.5" fill="#a8232b"/><path d="M5 5.5c1-1.5 5-1.5 6 0M5 8c1-1.5 5-1.5 6 0M5.5 10.5c.8-1 4.2-1 5 0" stroke="#fff" stroke-width="1.2" fill="none"/>',
  Bridge: '<rect x="1.5" y="2.5" width="5" height="4" fill="#3d6fc4"/><rect x="9.5" y="2.5" width="5" height="4" fill="#3d6fc4"/><rect x="5.5" y="10" width="5" height="4" fill="#3d6fc4"/><path d="M4 6.5V8.5h8V6.5M8 8.5V10" stroke="#333" fill="none"/>',
  PPP: '<rect x="2" y="3" width="12" height="4" fill="#4a78c8"/><rect x="2" y="9" width="12" height="4" fill="#7a9fd8"/><circle cx="4.5" cy="5" r=".8" fill="#fff"/><circle cx="4.5" cy="11" r=".8" fill="#fff"/>',
  Switch: '<rect x="1.5" y="4.5" width="13" height="7" fill="#e8e8e8" stroke="#555"/><path d="M4 7h6M8.5 5.5L10 7 8.5 8.5M12 9.5H6M7.5 8L6 9.5 7.5 11" stroke="#333" fill="none"/>',
  Mesh: '<path d="M3 3h10L8 13z" stroke="#3d4f9a" fill="none"/><g fill="#3d4f9a"><circle cx="3" cy="3" r="1.8"/><circle cx="13" cy="3" r="1.8"/><circle cx="8" cy="13" r="1.8"/></g>',
  IP: '<rect x="1.5" y="2.5" width="13" height="8" fill="#fff" stroke="#666"/><text x="8" y="8.8" font-size="6" text-anchor="middle" fill="#222" font-family="Arial" font-weight="700">255</text><path d="M3 13.5h10" stroke="#3a9a45" stroke-width="2"/>',
  IPv6: '<rect x="1.5" y="2.5" width="13" height="8" fill="#fff" stroke="#666"/><text x="8" y="8.8" font-size="6" text-anchor="middle" fill="#222" font-family="Arial" font-weight="700">v6</text><path d="M3 13.5h10" stroke="#3a6fc4" stroke-width="2"/>',
  MPLS: '<circle cx="8" cy="8" r="6" fill="#e6e6e6" stroke="#777"/><circle cx="8" cy="8" r="2.5" fill="#999"/>',
  Routing: '<rect x="1.5" y="4.5" width="13" height="7" rx="1" fill="#3a6fc4"/><path d="M4 8h8M10 6l2 2-2 2" stroke="#fff" stroke-width="1.3" fill="none"/>',
  System: '<circle cx="8" cy="8" r="3" fill="none" stroke="#6b7078" stroke-width="3"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3 3l2 2M11 11l2 2M13 3l-2 2M3 13l2-2" stroke="#6b7078" stroke-width="2"/>',
  Queues: '<path d="M2 3h12l-2 4H4zM3 9h10l-1.6 3.5H4.6z" fill="#c4452e"/>',
  Files: '<path d="M1.5 4h5l1.5 1.5h6.5V13h-13z" fill="#4f93d8" stroke="#2f6aa8"/>',
  Log: '<rect x="3" y="1.5" width="10" height="13" fill="#fff" stroke="#777"/><path d="M5 5h6M5 7.5h6M5 10h6" stroke="#999"/>',
  RADIUS: '<circle cx="5.5" cy="5" r="2.2" fill="#3d6fc4"/><path d="M1.5 13c0-4 8-4 8 0z" fill="#3d6fc4"/><circle cx="11" cy="6" r="2" fill="#e08a2a"/><path d="M8 14c0-3.5 7-3.5 7 0z" fill="#e08a2a"/>',
  Tools: '<path d="M3 13l6-6" stroke="#c4452e" stroke-width="2.4" stroke-linecap="round"/><path d="M13 13L7 7" stroke="#777" stroke-width="2.4" stroke-linecap="round"/><circle cx="11" cy="4" r="2.5" fill="none" stroke="#c4452e" stroke-width="1.6"/>',
  'New Terminal': '<rect x="1" y="2.5" width="14" height="11" rx="1" fill="#1e1e1e"/><path d="M3.5 6l2.5 2-2.5 2M8 11h4" stroke="#fff" stroke-width="1.2" fill="none"/>',
  Dot1X: '<rect x="2" y="2" width="12" height="12" rx="2" fill="#c4452e"/><path d="M5 8h6M8 5v6" stroke="#fff" stroke-width="1.6"/>',
  TR069: '<circle cx="8" cy="8" r="6.5" fill="#eee" stroke="#777"/><path d="M1.5 8h13M8 1.5c-3 3-3 10 0 13M8 1.5c3 3 3 10 0 13" stroke="#777" fill="none"/>',
  'Make Supout.rif': '<path d="M3 1.5h7l3 3v10H3z" fill="#fff" stroke="#777"/><path d="M5 10h6M8 7v6" stroke="#3d6fc4" stroke-width="1.6"/>',
  Exit: '<rect x="1.5" y="1.5" width="13" height="13" fill="#a05a2a" stroke="#6a3a18"/><path d="M5 5l6 6M11 5l-6 6" stroke="#fff" stroke-width="1.6"/>',
  Windows: '<rect x="1.5" y="3" width="13" height="10" fill="#fff" stroke="#3d6fc4"/><rect x="1.5" y="3" width="13" height="2.5" fill="#3d6fc4"/>',
};

const sub = (s: string, m: Record<string, string>): [string, string][] =>
  s.split('|').map(n => [n, m[n] || '']);

const rawMenu: [string, any][] = [
  ['Quick Set', ''],
  ['CAPsMAN', ''],
  ['Interfaces', 'if'],
  ['Wireless', ''],
  ['Bridge', ''],
  ['PPP', ''],
  ['Switch', ''],
  ['Mesh', ''],
  [
    'IP',
    sub(
      'ARP|Accounting|Addresses|Cloud|DHCP Client|DHCP Relay|DHCP Server|DNS|Firewall|Hotspot|IPsec|Kid Control|Neighbors|Packing|Pool|Routes|SNMP|SSH|Services|Settings|Socks|TFTP|Traffic Flow|UPnP|Web Proxy',
      { Addresses: 'ad', 'DHCP Client': 'dh', DNS: 'dn', Firewall: 'fw', Routes: 'rt' }
    ),
  ],
  ['MPLS', ''],
  ['Routing', ''],
  [
    'System',
    sub(
      'Auto Upgrade|Certificates|Clock|Console|History|Identity|LEDs|License|Logging|NTP Client|Packages|Password|Ports|Reboot|Reset Configuration|Resources|RouterBOARD|Scheduler|Scripts|Shutdown|Special Login|Users|Watchdog',
      { Identity: 'id', 'Reset Configuration': 'rs' }
    ),
  ],
  ['Queues', ''],
  ['Files', ''],
  ['Log', ''],
  ['RADIUS', ''],
  [
    'Tools',
    sub(
      'BTest Server|Bandwidth Test|Email|Flood Ping|Graphing|IP Scan|MAC Server|Netwatch|Packet Sniffer|Ping|Ping Speed|Profile|RoMON|SMS|Speed Test|Telnet|Torch|Traceroute|Traffic Generator|Traffic Monitor|WoL',
      { Ping: 'pg' }
    ),
  ],
  ['New Terminal', 'tm'],
  ['Make Supout.rif', ''],
  ['New WinBox', ''],
  ['Exit', 'xt'],
];

export default function App() {
  // App state
  const [S, setS] = useState<Record<string, RouterState>>({
    R1: mkRouter(),
    R2: mkRouter(),
    R3: mkRouter(),
  });
  const [cut, setCut] = useState<Record<string, boolean>>({});
  const [cur, setCur] = useState<string>('R1');
  const [pc, setPc] = useState<string>('R1');
  const [isSessionOpen, setIsSessionOpen] = useState<boolean>(false);
  const [showMap, setShowMap] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>('Connected');
  const [loginErr, setLoginErr] = useState<string>('');
  const [connectTo, setConnectTo] = useState<string>('');
  const [loginUser, setLoginUser] = useState<string>('admin');
  const [loginPass, setLoginPass] = useState<string>('');
  const [selectedNeighbor, setSelectedNeighbor] = useState<string | null>(null);
  const [rebooting, setRebooting] = useState<{ seconds: number; note?: string } | null>(null);
  const [sessionMenuOpen, setSessionMenuOpen] = useState<boolean>(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [fsPanel, setFsPanel] = useState<'revisor' | 'guia' | 'mapa' | 'cables' | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showFullGuideModal, setShowFullGuideModal] = useState<boolean>(false);
  const [wbGuideTab, setWbGuideTab] = useState<'R1' | 'R2' | 'R3'>('R1');
  const [doneSteps, setDoneSteps] = useState<Record<string, boolean>>({});
  const [guideMode, setGuideMode] = useState<'winbox' | 'cli'>('winbox');

  const copyToClipboard = (text: string, id: string) => {
    const onSuccess = () => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, id));
    } else {
      fallbackCopy(text, id);
    }
  };

  const fallbackCopy = (text: string, id: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {}
    document.body.removeChild(ta);
  };

  const toggleFullScreen = () => {
    setIsFullScreen(prev => {
      const next = !prev;
      if (next) {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullScreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Anti-inspection / Code Protection
  useEffect(() => {
    // 1. Block right click context menu (prevents "Inspeccionar elemento" and "Ver código fuente")
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // 2. Block inspection shortcuts: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U, Ctrl+S
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // F12
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+Shift+I, J, C (DevTools)
      if (isCtrlOrMeta && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+U (View Source)
      if (isCtrlOrMeta && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+S (Save webpage)
      if (isCtrlOrMeta && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    // 3. Clear console periodically
    const antiDebugInterval = setInterval(() => {
      try {
        console.clear();
      } catch (err) {}
    }, 2500);

    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown, true);
      clearInterval(antiDebugInterval);
    };
  }, []);

  // MDI Windows state
  interface WindowInstance {
    id: string;
    type: string;
    title: string;
    x: number;
    y: number;
    w: number;
    h?: number;
    zIndex: number;
    maximized?: boolean;
    data?: any;
  }
  const [windows, setWindows] = useState<WindowInstance[]>([]);
  const [topZ, setTopZ] = useState<number>(10);
  const [windowOffset, setWindowOffset] = useState<number>(0);

  // Uptime tracking
  const [tick, setTick] = useState<number>(0);
  const startTimeRef = useRef<number>(Date.now());
  const initialUptimes: Record<string, number> = { R1: 1189, R2: 1061, R3: 1027 };

  useEffect(() => {
    const iv = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const getUpSeconds = (r: string) => {
    return (initialUptimes[r] || 1000) + Math.floor((Date.now() - startTimeRef.current) / 1000);
  };

  const hms = (s: number) => {
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const hx = (n: number) => n.toString(16);
  const ll6 = (m: string) => {
    const b = m.split(':').map(x => parseInt(x, 16));
    return (
      'fe80::' +
      [
        hx(((b[0] ^ 2) << 8) | b[1]),
        hx((b[2] << 8) | 255),
        hx((254 << 8) | b[3]),
        hx((b[4] << 8) | b[5]),
      ].join(':')
    );
  };

  // Peer & network logic
  const peer = (n: string, i: string) => {
    for (const l of L) {
      const x =
        l.a[0] === n && l.a[1] === i ? l.b : l.b[0] === n && l.b[1] === i ? l.a : null;
      if (x) return { node: x[0], iface: x[1], dead: !!cut[l.id] };
    }
    return null;
  };

  const run = (n: string, i: string) => {
    const p = peer(n, i);
    return !!p && !p.dead;
  };

  const bound = (n: string, d: DhcpEntry) => run(n, d.i) && peer(n, d.i)?.node === 'NET';

  const AD = (n: string) =>
    S[n].a.concat(
      S[n].d
        .filter(d => bound(n, d))
        .map(d => ({ v: '203.0.113.20/24', i: d.i, dyn: 1 }))
    );

  const RT = (n: string) =>
    S[n].r.concat(
      S[n].d
        .filter(d => d.def && bound(n, d))
        .map(d => ({ d: '0.0.0.0/0', g: '203.0.113.1', dist: 1, dyn: 1, on: true }))
    );

  const ipOf = (n: string, i: string) => {
    const x = AD(n).find(a => a.i === i);
    return x ? x.v.split('/')[0] : null;
  };

  const own = (n: string, ip: string) => AD(n).some(a => a.v.split('/')[0] === ip);

  const gwI = (n: string, g: string) => {
    const x = AD(n).find(a => {
      const q = pa(a.v);
      return run(n, a.i) && q && inn(g, q.a, q.p) && g !== q.a;
    });
    return x ? x.i : null;
  };

  const natOk = (n: string, i: string) =>
    S[n].n.some(x => x.action === 'masquerade' && x.out === i);

  function look(n: string, dst: string) {
    let b: any = null;
    const t = (c: any) => {
      if (!b || c.len > b.len || (c.len === b.len && c.dist < b.dist)) b = c;
    };
    AD(n).forEach(a => {
      const q = pa(a.v);
      if (q && run(n, a.i) && inn(dst, q.a, q.p)) {
        t({ len: q.p, dist: 0, i: a.i, c: 1 });
      }
    });
    RT(n).forEach(r => {
      const q = pa(r.d);
      if (r.on === false || !q || !V(r.g)) return;
      const i = gwI(n, r.g);
      if (i && inn(dst, q.a, q.p)) {
        t({ len: q.p, dist: r.dist, i, r });
      }
    });
    return b;
  }

  function walk(s: string, dst: string, src: string, h: string[]): { ok?: number; at?: string; err?: string } {
    let c = s;
    for (let k = 0; k < 9; k++) {
      if (own(c, dst)) return { ok: 1, at: c };
      const m = look(c, dst);
      if (!m) return { err: c + ': no route to host (sin ruta a ' + dst + ')' };
      const nh = m.c ? dst : m.r.g;
      const p = peer(c, m.i);
      if (!p) return { err: c + ': interface sin conexión' };
      if (p.node === 'NET') {
        h.push(nh);
        if (priv(dst)) return { err: 'Internet descarta ' + dst + ' (IP privada)' };
        if (priv(src) && !natOk(c, m.i)) {
          return {
            err:
              'Internet descarta el origen ' +
              src +
              ' (privada): ' +
              c +
              ' no tiene NAT masquerade en ' +
              m.i,
          };
        }
        return { ok: 1, at: c };
      }
      const pi = ipOf(p.node, p.iface);
      if (!pi || pi !== nh) {
        return {
          err:
            c +
            ': ' +
            nh +
            ' no responde en ' +
            m.i +
            ' (el otro extremo no tiene esa IP)',
        };
      }
      h.push(pi);
      c = p.node;
    }
    return { err: 'el paquete da vueltas (loop)' };
  }

  function rtLookup(n: string, dst: string) {
    const h: string[] = [];
    const o = own(n, dst);
    const m = o ? 1 : look(n, dst);
    if (!m) return { err: n + ': no route to host (sin ruta a ' + dst + ')', h };
    const src = o ? dst : ipOf(n, m.i);
    if (!src) return { err: n + ': sin interfaz activa', h };
    const f = walk(n, dst, src, h);
    if (!f.ok) return { err: f.err, h };
    const b = walk(f.at!, src, dst, []);
    if (!b.ok) return { err: 'la ida llega, pero la respuesta no vuelve: ' + b.err, h };
    return { ok: 1, h };
  }

  function resolveDns(n: string, t: string) {
    if (V(t)) return { ip: t };
    const s = S[n].dns.split(',')[0].trim();
    if (!V(s)) return { err: 'failure: dns name does not exist' };
    return rtLookup(n, s).ok ? { ip: '142.250.78.14' } : { err: 'failure: dns timeout' };
  }

  function pingLines(n: string, t: string, c: number) {
    const r = resolveDns(n, t);
    if (r.err) return [r.err];
    const x = rtLookup(n, r.ip!);
    const hw = x.h ? x.h.length : 0;
    const o = ['  SEQ HOST              SIZE  TTL TIME   STATUS'];
    let k2 = 0;
    for (let k = 0; k < c; k++) {
      const a = String(k).padStart(5) + ' ' + r.ip!.padEnd(17);
      if (x.ok) {
        k2++;
        o.push(
          a +
            ' 56 ' +
            String(Math.max((hw ? 65 - hw : 64) - (priv(r.ip!) ? 0 : 6), 1)).padStart(4) +
            ' ' +
            (priv(r.ip!) ? Math.max(hw - 1, 0) : 8 + hw * 2) +
            'ms'
        );
      } else {
        o.push(
          a +
            '              ' +
            (k === 0 && /no route/.test(x.err || '') ? 'no route to host' : 'timeout')
        );
      }
    }
    o.push('    sent=' + c + ' received=' + k2 + ' packet-loss=' + Math.round((100 * (c - k2)) / c) + '%');
    if (!x.ok) o.push('    -> ' + x.err);
    return o;
  }

  function tracerouteLines(n: string, t: string) {
    const r = resolveDns(n, t);
    if (r.err) return [r.err];
    const x = rtLookup(n, r.ip!);
    const h = x.h ? x.h.slice() : [];
    if (x.ok && h[h.length - 1] !== r.ip) h.push(r.ip!);
    return ['  # ADDRESS          TIME'].concat(
      h.map((a, k) => String(k + 1).padStart(3) + ' ' + a.padEnd(16) + ' ' + (k * 2 + 1) + 'ms'),
      x.ok ? [] : [String(h.length + 1).padStart(3) + ' timeout', '    -> ' + x.err]
    );
  }

  const getRtab = (n: string) => {
    const o: any[] = [];
    AD(n).forEach(a => {
      if (!run(n, a.i)) return;
      const q = pa(a.v);
      if (q) {
        o.push({ f: 'DAC', d: net(q.a, q.p) + '/' + q.p, g: a.i + ' reachable', k: 0, ref: null });
      }
    });
    RT(n).forEach(r => {
      const A = !!gwI(n, r.g);
      o.push({
        f: (r.dyn ? 'D' : '') + (A ? 'A' : '') + (r.dyn ? 'd' : 'S'),
        d: r.d,
        g: r.g + (A ? '' : ' unreachable'),
        k: r.dist,
        ref: r,
      });
    });
    return o;
  };

  const kv = (s: string) => {
    const o: Record<string, string> = {};
    (s.match(/[\w-]+=(?:"[^"]*"|\S+)/g) || []).forEach(t => {
      const i = t.indexOf('=');
      o[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '');
    });
    return o;
  };

  // Execute terminal / CLI command
  const executeCommand = (line: string, targetRouter: string = cur): string[] => {
    let l = line.trim().replace(/\s+/g, ' ');
    if (!l || l[0] === '#') return [];
    if (l[0] !== '/') l = '/' + l;

    const s = S[targetRouter];
    const a = kv(l);
    const is = (re: RegExp) => re.test(l);

    if (is(/^\/system identity set/)) {
      if (a.name) {
        setS(prev => ({
          ...prev,
          [targetRouter]: { ...prev[targetRouter], id: a.name },
        }));
      }
      return [];
    }
    if (is(/^\/system reset-configuration/)) {
      setS(prev => ({ ...prev, [targetRouter]: mkRouter() }));
      triggerReboot(targetRouter, 'Reseteando… el router se reinicia.');
      return ['Reseteando… el router se reinicia.'];
    }
    if (is(/^\/ip address add/)) {
      const q = a.address && pa(a.address);
      if (!q || a.address.indexOf('/') < 0) return ['failure: invalid value for argument address'];
      if (!IFS.includes(a.interface)) return ['failure: invalid value for argument interface'];
      if (s.a.some(x => x.v === a.address)) return ['failure: already have such address'];
      setS(prev => ({
        ...prev,
        [targetRouter]: {
          ...prev[targetRouter],
          a: [...prev[targetRouter].a, { v: a.address, i: a.interface }],
        },
      }));
      return [];
    }
    if (is(/^\/ip route add/)) {
      const d = a['dst-address'] || '0.0.0.0/0';
      const g = a.gateway;
      const k = +(a.distance || 1);
      if (!pa(d) || d.indexOf('/') < 0) return ['failure: invalid value for argument dst-address'];
      if (!V(g)) return ['failure: invalid value for argument gateway'];
      if (s.r.some(x => x.d === d && x.g === g && x.dist === k)) {
        return ['failure: already have such entry'];
      }
      setS(prev => ({
        ...prev,
        [targetRouter]: {
          ...prev[targetRouter],
          r: [...prev[targetRouter].r, { d, g, dist: k, on: true }],
        },
      }));
      return [];
    }
    if (is(/^\/ip dhcp-client add/)) {
      if (!IFS.includes(a.interface)) return ['failure: invalid value for argument interface'];
      if (s.d.some(x => x.i === a.interface)) return ['failure: already have such entry'];
      setS(prev => ({
        ...prev,
        [targetRouter]: {
          ...prev[targetRouter],
          d: [...prev[targetRouter].d, { i: a.interface, def: a['add-default-route'] !== 'no' }],
        },
      }));
      return [];
    }
    if (is(/^\/ip firewall nat add/)) {
      if (a.action !== 'masquerade') {
        return ['failure: este simulador solo conoce action=masquerade'];
      }
      setS(prev => ({
        ...prev,
        [targetRouter]: {
          ...prev[targetRouter],
          n: [
            ...prev[targetRouter].n,
            { chain: a.chain || 'srcnat', out: a['out-interface'] || '', action: 'masquerade' },
          ],
        },
      }));
      return [];
    }
    if (is(/^\/ip dns set/)) {
      if (a.servers !== undefined) {
        setS(prev => ({
          ...prev,
          [targetRouter]: { ...prev[targetRouter], dns: a.servers },
        }));
      }
      return [];
    }
    if (is(/^\/ip route remove/)) {
      setS(prev => ({
        ...prev,
        [targetRouter]: { ...prev[targetRouter], r: [] },
      }));
      return [];
    }
    if (is(/^\/ip address remove/)) {
      setS(prev => ({
        ...prev,
        [targetRouter]: { ...prev[targetRouter], a: [] },
      }));
      return [];
    }
    if (is(/^\/ip firewall nat remove/)) {
      setS(prev => ({
        ...prev,
        [targetRouter]: { ...prev[targetRouter], n: [] },
      }));
      return [];
    }
    if (is(/^\/ip dhcp-client remove/)) {
      setS(prev => ({
        ...prev,
        [targetRouter]: { ...prev[targetRouter], d: [] },
      }));
      return [];
    }
    if (is(/^\/ip address print/)) {
      return ['Flags: D - dynamic', '# ADDRESS            NETWORK         INTERFACE'].concat(
        AD(targetRouter).map((x, k) => {
          const q = pa(x.v);
          return (
            ' ' +
            k +
            (x.dyn ? ' D ' : '   ') +
            x.v.padEnd(19) +
            (q ? net(q.a, q.p) : '').padEnd(16) +
            x.i
          );
        })
      );
    }
    if (is(/^\/ip route print/)) {
      return [
        'Flags: A - active, D - dynamic, C - connect, S - static',
        '#    DST-ADDRESS        GATEWAY                   DIST',
      ].concat(
        getRtab(targetRouter).map(
          (r, k) => ' ' + k + ' ' + r.f.padEnd(4) + r.d.padEnd(19) + r.g.padEnd(26) + r.k
        )
      );
    }
    if (is(/^\/ip dhcp-client print/)) {
      return ['# INTERFACE  ADD-DEFAULT-ROUTE  STATUS     ADDRESS'].concat(
        s.d.map(
          (x, k) =>
            ' ' +
            k +
            ' ' +
            x.i.padEnd(10) +
            (x.def ? 'yes' : 'no').padEnd(18) +
            (bound(targetRouter, x) ? 'bound     203.0.113.20/24' : 'searching...')
        )
      );
    }
    if (is(/^\/ip firewall nat print/)) {
      return ['# CHAIN   ACTION      OUT-INTERFACE'].concat(
        s.n.map((x, k) => ' ' + k + ' ' + x.chain.padEnd(8) + x.action.padEnd(12) + x.out)
      );
    }
    let m = l.match(/^\/ping (\S+)/);
    if (m) return pingLines(targetRouter, m[1], +(a.count || 4));
    m = l.match(/^\/tool traceroute (\S+)/);
    if (m) return tracerouteLines(targetRouter, m[1]);

    return ['bad command name ' + l.split(' ')[0].slice(1) + ' (line 1 column 1)'];
  };

  const triggerReboot = (r: string, note?: string) => {
    setWindows([]);
    setRebooting({ seconds: 4, note });
    setStatusMsg('Disconnected. Reconnecting…');
    let timer = 4;
    const interval = setInterval(() => {
      timer--;
      if (timer > 0) {
        setRebooting({ seconds: timer, note });
      } else {
        clearInterval(interval);
        setRebooting(null);
        setStatusMsg('Connected to ' + MAC[r]);
        openWindow('ad');
      }
    }, 1000);
  };

  // Reviewer logic
  const checkConfig = (n: string) => {
    const o: { st: 'ok' | 'bad' | 'wait'; t: string }[] = [];
    const bad = new Set<any>();
    const s = S[n];
    const A: { v: string; i: string }[] = [];
    const R: { d: string; g: string; k: number }[] = [];
    let id = '';
    let dh: string | null = null;
    let nt = '';
    let dns = '';

    G[n].split('\n').forEach(l => {
      const a = kv(l);
      if (/identity/.test(l)) id = a.name;
      else if (/address add/.test(l)) A.push({ v: a.address, i: a.interface });
      else if (/route add/.test(l)) R.push({ d: a['dst-address'], g: a.gateway, k: +a.distance });
      else if (/dhcp-client/.test(l)) dh = a.interface;
      else if (/nat add/.test(l)) nt = a['out-interface'];
      else if (/dns set/.test(l)) dns = a.servers;
    });

    const add = (st: 'ok' | 'bad' | 'wait', t: string) => o.push({ st, t });
    const rk = (e: RouteEntry) => R.some(y => y.d === e.d && y.g === e.g && y.k === e.dist);

    if (s.id === id) add('ok', 'Identity ' + id);
    else add(s.id === 'MikroTik' ? 'wait' : 'bad', 'Identity: debe ser ' + id + (s.id === 'MikroTik' ? '' : ' (pusiste ' + s.id + ')'));

    A.forEach(e => {
      const f = s.a.find(x => x.i === e.i);
      if (f && f.v === e.v) add('ok', 'Address ' + e.v + ' en ' + e.i);
      else if (f) {
        bad.add(f);
        add('bad', e.i + ': pusiste ' + f.v + ' y la guía dice ' + e.v);
      } else {
        add('wait', 'Falta Address ' + e.v + ' en ' + e.i);
      }
    });

    s.a.forEach(x => {
      const e = A.find(entry => entry.i === x.i);
      if (!e || s.a.find(y => y.i === x.i) !== x) {
        bad.add(x);
        add('bad', 'Address ' + x.v + ' en ' + x.i + ' no está en la guía');
      }
    });

    R.forEach(e => {
      const t = e.k > 1 ? ' (respaldo, distance ' + e.k + ')' : '';
      if (s.r.some(x => x.d === e.d && x.g === e.g && x.dist === e.k)) {
        add('ok', 'Ruta ' + e.d + ' vía ' + e.g + t);
      } else {
        const w = s.r.find(x => !bad.has(x) && !rk(x) && x.d === e.d && (x.g === e.g || x.dist === e.k));
        if (w) {
          bad.add(w);
          add('bad', 'Ruta ' + w.d + ': pusiste gateway ' + w.g + ' y distance ' + w.dist + '. La guía dice gateway ' + e.g + ' y distance ' + e.k);
        } else {
          add('wait', 'Falta ruta ' + e.d + ' vía ' + e.g + t);
        }
      }
    });

    s.r.forEach(x => {
      if (!rk(x) && !bad.has(x)) {
        bad.add(x);
        add('bad', 'Ruta ' + x.d + ' vía ' + x.g + ' no está en la guía');
      }
    });

    if (dh) add(s.d.some(x => x.i === dh) ? 'ok' : 'wait', (s.d.some(x => x.i === dh) ? '' : 'Falta ') + 'DHCP Client en ' + dh);
    s.d.forEach(x => {
      if (x.i !== dh) {
        bad.add(x);
        add('bad', 'DHCP Client en ' + x.i + ' no está en la guía' + (dh ? ' (va en ' + dh + ')' : ' para este router'));
      }
    });

    if (nt) add(s.n.some(x => x.out === nt) ? 'ok' : 'wait', (s.n.some(x => x.out === nt) ? '' : 'Falta ') + 'NAT masquerade en ' + nt);
    s.n.forEach(x => {
      if (x.out !== nt) {
        bad.add(x);
        add('bad', 'NAT en ' + (x.out || '(vacío)') + ' no está en la guía');
      }
    });

    if (dns) {
      if (s.dns === dns) add('ok', 'DNS ' + dns);
      else add(s.dns ? 'bad' : 'wait', s.dns ? 'DNS: pusiste ' + s.dns + ' y la guía dice ' + dns : 'Falta DNS ' + dns);
    }

    return { o, bad };
  };

  const reviewResult = checkConfig(cur);

  // MDI Window management
  const bringToFront = (id: string) => {
    setTopZ(z => z + 1);
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, zIndex: topZ + 1 } : w))
    );
  };

  const closeWindow = (id: string) => {
    setWindows(prev => prev.filter(w => w.id !== id));
  };

  const toggleMaximize = (id: string) => {
    setWindows(prev =>
      prev.map(w => (w.id === id ? { ...w, maximized: !w.maximized } : w))
    );
  };

  const openWindow = (type: string, data?: any) => {
    const existing = windows.find(w => w.id === type || (data?.key && w.id === `${type}-${data.key}`));
    if (existing) {
      bringToFront(existing.id);
      return;
    }

    let title = '';
    let width = 450;
    const windowId = data?.key ? `${type}-${data.key}` : type;

    switch (type) {
      case 'if':
        title = 'Interface List';
        width = 440;
        break;
      case 'ad':
        title = 'Address List';
        width = 440;
        break;
      case 'rt':
        title = 'Route List';
        width = 560;
        break;
      case 'dh':
        title = 'DHCP Client';
        width = 580;
        break;
      case 'fw':
        title = 'Firewall';
        width = 640;
        break;
      case 'dn':
        title = 'DNS Settings';
        width = 440;
        break;
      case 'id':
        title = 'Identity';
        width = 340;
        break;
      case 'rs':
        title = 'Reset Configuration';
        width = 400;
        break;
      case 'pg':
        title = 'Ping';
        width = 460;
        break;
      case 'tm':
        title = 'Terminal';
        width = 520;
        break;
      case 'edit_addr':
        title = `Address <${data.item.v}>`;
        width = 440;
        break;
      case 'new_addr':
        title = 'New Address';
        width = 440;
        break;
      case 'new_route':
        title = 'New Route';
        width = 480;
        break;
      case 'edit_route':
        title = `Route <${data.item.d}>`;
        width = 480;
        break;
      case 'new_dhcp':
        title = 'New DHCP Client';
        width = 480;
        break;
      case 'edit_dhcp':
        title = `DHCP Client <${data.item.i}>`;
        width = 480;
        break;
      case 'new_nat':
        title = 'New NAT Rule';
        width = 460;
        break;
      case 'edit_nat':
        title = `NAT Rule <${data.item.chain}>`;
        width = 460;
        break;
      default:
        title = type;
        width = 400;
    }

    const nextOffset = (windowOffset + 1) % 6;
    setWindowOffset(nextOffset);
    const newWin: WindowInstance = {
      id: windowId,
      type,
      title,
      x: 10 + nextOffset * 22,
      y: 10 + nextOffset * 22,
      w: width,
      zIndex: topZ + 1,
      data,
    };
    setTopZ(z => z + 1);
    setWindows(prev => [...prev, newWin]);
  };

  // Draggable Window Handler
  const startDragWindow = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    bringToFront(id);
    const win = windows.find(w => w.id === id);
    if (!win || win.maximized) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const initX = win.x;
    const initY = win.y;

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setWindows(prev =>
        prev.map(w =>
          w.id === id
            ? { ...w, x: Math.max(0, initX + dx), y: Math.max(0, initY + dy) }
            : w
        )
      );
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Dragging the PC Cable plug
  const [plugDrag, setPlugDrag] = useState<boolean>(false);
  const [plugPos, setPlugPos] = useState<{ x: number; y: number } | null>(null);
  const pcSvgRef = useRef<SVGSVGElement | null>(null);

  const getP4X = (r: string) => {
    const idx = ['R1', 'R2', 'R3'].indexOf(r);
    return 190 + idx * 170 + 106 + 12;
  };

  const currentPlugX = plugPos ? plugPos.x : getP4X(pc);
  const currentPlugY = plugPos ? plugPos.y : 140;

  const handlePlugPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setPlugDrag(true);
    if (pcSvgRef.current) {
      const pt = pcSvgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(pcSvgRef.current.getScreenCTM()!.inverse());
      setPlugPos({ x: svgP.x, y: svgP.y });
    }
  };

  useEffect(() => {
    if (!plugDrag) return;
    const onMove = (e: PointerEvent) => {
      if (!pcSvgRef.current) return;
      const pt = pcSvgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(pcSvgRef.current.getScreenCTM()!.inverse());
      setPlugPos({ x: svgP.x, y: svgP.y });
    };

    const onUp = (e: PointerEvent) => {
      setPlugDrag(false);
      if (!pcSvgRef.current) return;
      const pt = pcSvgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(pcSvgRef.current.getScreenCTM()!.inverse());

      let bestR = pc;
      let minD = 90;
      ['R1', 'R2', 'R3'].forEach(r => {
        const dx = Math.abs(svgP.x - getP4X(r));
        if (dx < minD && svgP.y > 90 && svgP.y < 195) {
          minD = dx;
          bestR = r;
        }
      });
      setPlugPos(null);
      plugInto(bestR);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [plugDrag, pc]);

  const plugInto = (r: string) => {
    setPc(r);
    setConnectTo('');
    setLoginErr('');
    setSelectedNeighbor(null);
  };

  // Login handler
  const handleConnect = () => {
    const v = connectTo.trim();
    if (!v) {
      setLoginErr('');
      return;
    }
    const pcMac = MAC[pc];
    const pcLl6 = `[${ll6(pcMac)}%9]`;
    const isMacMatch = pcMac.toLowerCase() === v.toLowerCase();
    const isLl6Match = pcLl6.toLowerCase() === v.toLowerCase();

    if (!isMacMatch && !isLl6Match) {
      setLoginErr(`could not connect to ${v} Reason:connection timed out. Will retry in 3 seconds`);
      return;
    }

    if (loginPass !== '' || loginUser !== 'admin') {
      setLoginErr('ERROR: wrong username or password');
      return;
    }

    setLoginErr('');
    setCur(pc);
    setIsSessionOpen(true);
    setStatusMsg(`Connected to ${MAC[pc]}`);
    setWindows([]);
    setTimeout(() => {
      openWindow('ad');
    }, 50);
  };

  const handleDisconnect = () => {
    setIsSessionOpen(false);
    setLoginErr('');
    setConnectTo('');
  };

  const handlePasteGuide = () => {
    openWindow('tm', { autoRun: G[cur] });
    setStatusMsg(`Guía de ${cur} pegada en el Terminal.`);
  };

  const v7 = VER[cur][1] === '7';

  return (
    <main className={isFullScreen ? 'fullscreen' : ''}>
      {!isFullScreen && (
        <>
          <h1>Simulador de Winbox: configura R1, R2 y R3 uno por uno</h1>
          <p className="mu">
            1) Conecta el cable del PC al ether4 de un router (arrastra el enchufe azul). 2) Pulsa Refresh en Neighbors,
            elige la fila y Connect, como entrar por MAC. 3) Ábrelo desde el menú izquierdo (IP, Addresses, Routes…) o pega
            la guía en New Terminal. Los cables físicos están abajo; la red solo funciona cuando todo coincide.
          </p>
        </>
      )}

      {/* Control bar */}
      {!isFullScreen && (
        <div className="ctl">
          <span hidden>
            <select
              id="rs"
              value={cur}
              onChange={e => {
                setCur(e.target.value);
                setWindows([]);
                setStatusMsg(`Connected to ${MAC[e.target.value]}`);
              }}
            >
              <option value="R1">R1 · CC:2D:E0:0B:34:A7</option>
              <option value="R2">R2 · D4:01:C3:B5:7B:DB</option>
              <option value="R3">R3 · 6C:3B:6B:17:EB:73</option>
            </select>
          </span>
          <button
            id="bm"
            aria-expanded={showMap}
            onClick={() => setShowMap(!showMap)}
          >
            {showMap ? 'Ocultar mapa' : 'Mostrar mapa'}
          </button>
          <button
            onClick={toggleFullScreen}
            style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            ⛶ Cubrir toda la pantalla
          </button>
          <span className="mu">el router se elige en Neighbors, con el cable del PC</span>
        </div>
      )}

      {/* PC Physical connection diagram */}
      {!isSessionOpen && (
        <div id="pcm" className="pcm">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
            <span>
              <b>Conexión física del PC</b>{' '}
              <span className="mu" style={{ fontSize: '11px' }}>
                (arrastra el enchufe azul o pulsa el puerto 4 de R1, R2 o R3)
              </span>
            </span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#1b8fcf' }}>
              Conectado a: <b>{pc} (ether4)</b>
            </span>
          </div>
          <svg
            id="pcs"
            ref={pcSvgRef}
            viewBox="0 0 740 200"
            role="group"
            aria-label="Cable del PC conectado al puerto ether4 de un router"
            style={{ width: '100%', maxHeight: '125px', height: 'auto', display: 'block', margin: '0 auto' }}
          >
            {/* PC Box */}
            <rect x="20" y="40" width="90" height="64" rx="5" className="dv" />
            <text x="65" y="78" textAnchor="middle" className="nm">
              PC
            </text>

            {/* Routers */}
            {['R1', 'R2', 'R3'].map((r, k) => {
              const x = 190 + k * 170;
              return (
                <g key={r}>
                  <rect className="dv" x={x} y="40" width="140" height="80" rx="6" />
                  <rect className="hd" x={x} y="40" width="140" height="6" rx="3" />
                  <text className="nm" x={x + 70} y="76" textAnchor="middle">
                    {r}
                  </text>
                  <text className="sm" x={x + 70} y="94" textAnchor="middle">
                    hAP lite · {VER[r].slice(1)}
                  </text>

                  {/* Ports 1 to 4 */}
                  {[0, 1, 2, 3].map(i => {
                    const isP4 = i === 3;
                    const px = x + 10 + i * 32;
                    return (
                      <g key={i}>
                        <rect
                          className={`pt ${isP4 ? 'p4' : ''}`}
                          x={px}
                          y="120"
                          width="24"
                          height="16"
                          rx="2"
                          tabIndex={isP4 ? 0 : -1}
                          role={isP4 ? 'button' : undefined}
                          aria-label={isP4 ? `Conectar el PC al ether4 de ${r}` : undefined}
                          onClick={() => isP4 && plugInto(r)}
                          onKeyDown={e => {
                            if (isP4 && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              plugInto(r);
                            }
                          }}
                        />
                        <text className="sm" x={px + 12} y="112" textAnchor="middle">
                          {i + 1}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* PC Cable & Plug */}
            <path
              id="pcc"
              d={`M65 104V180H${currentPlugX}V${currentPlugY - 2}`}
              className="cb"
            />
            <circle
              id="plug"
              cx={currentPlugX}
              cy={currentPlugY}
              r="9"
              className="pl"
              onPointerDown={handlePlugPointerDown}
            />
          </svg>
        </div>
      )}

      {/* WinBox Launcher (#ln) */}
      {!isSessionOpen && (
        <div className="wb" id="ln">
          <div className="tt">
            <i className="ai"></i>
            <span>WinBox (64bit) v3.43 (Addresses)</span>
            <span className="wc">
              <span>–</span>
              <span>□</span>
              <span>✕</span>
            </span>
          </div>
          <div className="mb">
            <span>File</span>
            <span>Tools</span>
          </div>
          <div className="lf">
            <div className="lg">
              <label htmlFor="lc">Connect To:</label>
              <input
                type="text"
                id="lc"
                autoComplete="off"
                value={connectTo}
                onChange={e => {
                  setConnectTo(e.target.value);
                  setLoginErr('');
                }}
              />
              <label className="ck">
                <input type="checkbox" defaultChecked disabled /> Keep Password
              </label>

              <label htmlFor="ll">Login:</label>
              <input
                type="text"
                id="ll"
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
              />
              <label className="ck">
                <input type="checkbox" disabled /> Open In New Window
              </label>

              <label htmlFor="lpw">Password:</label>
              <input
                type="password"
                id="lpw"
                autoComplete="off"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
              />
              <label className="ck">
                <input type="checkbox" defaultChecked disabled /> Auto Reconnect
              </label>
            </div>

            <div className="lb-box">
              <button disabled>Add/Set</button>
              <span>
                <button disabled>Connect To RoMON</button>{' '}
                <button id="lcn" onClick={handleConnect}>
                  Connect
                </button>
              </span>
            </div>

            <div className="lmsg" id="lmsg" role="status">
              {loginErr}
            </div>

            <div className="ltab">
              <span>Managed</span>
              <b>Neighbors</b>
            </div>

            <div className="lt">
              <button
                id="lrf"
                onClick={() => {
                  setSelectedNeighbor(null);
                  setConnectTo('');
                  setLoginErr('');
                }}
              >
                Refresh
              </button>
              <span className="mu">Find</span>
            </div>

            <div className="lw">
              <table id="nt">
                <thead>
                  <tr>
                    <th>MAC Address</th>
                    <th>IP Address</th>
                    <th>Identity</th>
                    <th>Version</th>
                    <th>Board</th>
                    <th>Uptime</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['0.0.0.0', MAC[pc]],
                    [ll6(MAC[pc]), `[${ll6(MAC[pc])}%9]`],
                  ].map((row, idx) => {
                    const isSel = selectedNeighbor === row[1];
                    return (
                      <tr
                        key={idx}
                        className={isSel ? 'sel' : ''}
                        onClick={() => {
                          setSelectedNeighbor(row[1]);
                          setConnectTo(row[1]);
                          setLoginErr('');
                        }}
                      >
                        <td>{MAC[pc]}</td>
                        <td>{row[0]}</td>
                        <td>{S[pc].id}</td>
                        <td>{VER[pc].slice(1)} (stable)</td>
                        <td>RB941-2nD</td>
                        <td className="upt">{hms(getUpSeconds(pc))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Connected Session (#ss) */}
      {isSessionOpen && (
        <div id="ss">
          <div className="wb">
            {/* Session Top Title Bar */}
            <div className="tt">
              <i className="ai"></i>
              <span id="ti">
                admin@{MAC[cur]} ({S[cur].id}) - WinBox (64bit) {VER[cur]} on hAP lite (smips)
              </span>
              <span className="wc">
                <span title="Minimizar">–</span>
                <span
                  title={isFullScreen ? 'Restaurar tamaño normal' : 'Maximizar a pantalla completa'}
                  onClick={toggleFullScreen}
                  style={{ cursor: 'pointer', fontWeight: 700 }}
                >
                  {isFullScreen ? '🗗' : '□'}
                </span>
                <span onClick={handleDisconnect} style={{ cursor: 'pointer' }} title="Desconectar">
                  ✕
                </span>
              </span>
            </div>

            {/* Menu bar with Session dropdown */}
            <div className="mb">
              <span
                id="mses"
                role="button"
                tabIndex={0}
                onClick={e => {
                  e.stopPropagation();
                  setSessionMenuOpen(!sessionMenuOpen);
                }}
              >
                Session
              </span>
              <span>Settings</span>
              <span>Dashboard</span>

              {/* Session Dropdown Menu */}
              {sessionMenuOpen && (
                <div
                  className="ddm"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="di" onClick={() => setSessionMenuOpen(false)}>
                    <i></i>New
                  </div>
                  <div className="di" onClick={() => setSessionMenuOpen(false)}>
                    <i></i>Open...
                  </div>
                  <div className="di" onClick={() => setSessionMenuOpen(false)}>
                    <i></i>Save
                  </div>
                  <div className="di" onClick={() => setSessionMenuOpen(false)}>
                    <i></i>Save As...
                  </div>
                  <hr />
                  <div className="di" onClick={() => setSessionMenuOpen(false)}>
                    <i>✓</i>Autosave on Close
                  </div>
                  <hr />
                  <div
                    className="di"
                    onClick={() => {
                      toggleFullScreen();
                      setSessionMenuOpen(false);
                    }}
                  >
                    <i></i>{isFullScreen ? 'Exit Full Screen' : 'Full Screen (Pantalla completa)'}
                  </div>
                  <hr />
                  <div
                    className="di"
                    onClick={() => {
                      setWindows([]);
                      setSessionMenuOpen(false);
                      setStatusMsg('Todas las ventanas cerradas');
                    }}
                  >
                    <i></i>Close All Windows
                  </div>
                  <hr />
                  <div
                    className="di"
                    onClick={() => {
                      setSessionMenuOpen(false);
                      handleDisconnect();
                    }}
                  >
                    <i></i>Disconnect
                  </div>
                  <div
                    className="di"
                    onClick={() => {
                      setSessionMenuOpen(false);
                      handleDisconnect();
                    }}
                  >
                    <i></i>Exit
                  </div>
                </div>
              )}
            </div>

            {/* WinBox Tool Bar */}
            <div className="tb">
              <button className="tbtn ub" disabled aria-label="Undo">
                ⟲
              </button>
              <button className="tbtn ub" disabled aria-label="Redo">
                ⟳
              </button>
              <button disabled>Safe Mode</button>
              <label>
                Session: <input type="text" id="se" readOnly value={MAC[cur]} />
              </label>

              <button
                onClick={toggleFullScreen}
                title={isFullScreen ? 'Restaurar tamaño estándar' : 'Cubrir toda la pantalla'}
                style={{
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: isFullScreen ? '#cfe0f5' : undefined,
                }}
              >
                {isFullScreen ? '🗗 Vista estándar' : '⛶ Toda la pantalla'}
              </button>

              {isFullScreen && (
                <div style={{ display: 'inline-flex', gap: '4px' }}>
                  <button
                    onClick={() => setFsPanel(fsPanel === 'revisor' ? null : 'revisor')}
                    style={{
                      background: fsPanel === 'revisor' ? 'var(--sel)' : undefined,
                      color: fsPanel === 'revisor' ? '#fff' : undefined,
                    }}
                  >
                    📋 Revisor ({reviewResult.o.filter(x => x.st === 'ok').length} ok / {reviewResult.o.filter(x => x.st === 'bad').length} err)
                  </button>
                  <button
                    onClick={() => setFsPanel(fsPanel === 'guia' ? null : 'guia')}
                    style={{
                      background: fsPanel === 'guia' ? 'var(--sel)' : undefined,
                      color: fsPanel === 'guia' ? '#fff' : undefined,
                    }}
                  >
                    📖 Guía {cur}
                  </button>
                  <button
                    onClick={() => setFsPanel(fsPanel === 'mapa' ? null : 'mapa')}
                    style={{
                      background: fsPanel === 'mapa' ? 'var(--sel)' : undefined,
                      color: fsPanel === 'mapa' ? '#fff' : undefined,
                    }}
                  >
                    🗺 Mapa
                  </button>
                  <button
                    onClick={() => setFsPanel(fsPanel === 'cables' ? null : 'cables')}
                    style={{
                      background: fsPanel === 'cables' ? 'var(--sel)' : undefined,
                      color: fsPanel === 'cables' ? '#fff' : undefined,
                    }}
                  >
                    🔌 Cables
                  </button>
                </div>
              )}

              <i className="gs" title="Connected"></i>
            </div>

            {/* WinBox Body */}
            <div className="bd">
              {/* Vertical Ribbon */}
              <div className="vs">RouterOS WinBox</div>

              {/* Sidebar Menu */}
              <div className="sb" id="sb">
                {rawMenu.map(([title, actionOrSub], idx) => {
                  if (v7 && title === 'CAPsMAN') return null;

                  const hasSub = Array.isArray(actionOrSub);
                  const isWireGuard = v7 && title === 'Interfaces';
                  const isIPv6 = v7 && title === 'IP';

                  return (
                    <React.Fragment key={title}>
                      <div className="g">
                        <div
                          className="mi"
                          onClick={() => {
                            if (hasSub) {
                              setActiveSubmenu(activeSubmenu === title ? null : title);
                            } else if (actionOrSub) {
                              setActiveSubmenu(null);
                              if (actionOrSub === 'xt') handleDisconnect();
                              else openWindow(actionOrSub);
                            } else {
                              setActiveSubmenu(null);
                              setStatusMsg(`${title} no está disponible en el simulador.`);
                            }
                          }}
                        >
                          {title === 'New WinBox' ? (
                            <i className="ai" style={{ marginRight: '0.45rem', verticalAlign: '-3px' }} />
                          ) : (
                            <svg
                              className="ic"
                              viewBox="0 0 16 16"
                              aria-hidden="true"
                              dangerouslySetInnerHTML={{ __html: SVG_ICONS[title] || '' }}
                            />
                          )}
                          {title}
                          {hasSub && <span className="ar">▸</span>}
                        </div>

                        {/* Submenu */}
                        {hasSub && activeSubmenu === title && (
                          <div className="sm">
                            {actionOrSub.map(([subName, subAct]: [string, string]) => (
                              <div
                                key={subName}
                                className={`mi ${subAct ? '' : 'dim'}`}
                                onClick={() => {
                                  setActiveSubmenu(null);
                                  if (subAct) openWindow(subAct);
                                  else setStatusMsg(`${subName} no está disponible en el simulador.`);
                                }}
                              >
                                {subName}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* RouterOS v7 Extra Items */}
                      {isWireGuard && (
                        <div
                          className="g"
                          onClick={() => setStatusMsg('WireGuard no está disponible en el simulador.')}
                        >
                          <div className="mi">
                            <svg
                              className="ic"
                              viewBox="0 0 16 16"
                              aria-hidden="true"
                              dangerouslySetInnerHTML={{ __html: SVG_ICONS['WireGuard'] || '' }}
                            />
                            WireGuard
                          </div>
                        </div>
                      )}

                      {isIPv6 && (
                        <div
                          className="g"
                          onClick={() => setStatusMsg('IPv6 no está disponible en el simulador.')}
                        >
                          <div className="mi">
                            <svg
                              className="ic"
                              viewBox="0 0 16 16"
                              aria-hidden="true"
                              dangerouslySetInnerHTML={{ __html: SVG_ICONS['IPv6'] || '' }}
                            />
                            IPv6
                            <span className="ar">▸</span>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* MDI Workspace Container */}
              <div
                className="mdi"
                id="mdi"
                onClick={() => {
                  setSessionMenuOpen(false);
                  setActiveSubmenu(null);
                }}
              >
                {/* Floating MDI Windows */}
                {windows.map(win => {
                  const isTop = topZ === win.zIndex;
                  return (
                    <div
                      key={win.id}
                      className={`w ${isTop ? 'fo' : ''} ${win.maximized ? 'mxz' : ''}`}
                      style={{
                        left: `${win.x}px`,
                        top: `${win.y}px`,
                        width: `${win.w}px`,
                        zIndex: win.zIndex,
                      }}
                      onPointerDown={() => bringToFront(win.id)}
                    >
                      {/* Window Header */}
                      <div
                        className="tt"
                        onPointerDown={e => startDragWindow(e, win.id)}
                      >
                        <b>{win.title}</b>
                        <span className="wbt">
                          <button
                            className="mx"
                            aria-label="Maximizar"
                            onClick={() => toggleMaximize(win.id)}
                          >
                            □
                          </button>
                          <button
                            className="x"
                            aria-label="Cerrar"
                            onClick={() => closeWindow(win.id)}
                          >
                            ×
                          </button>
                        </span>
                      </div>

                      {/* Window Content */}
                      <div className="c">
                        {renderWindowContent(win)}
                      </div>
                    </div>
                  );
                })}

                {/* Reboot Overlay */}
                {rebooting && (
                  <div className="rb">
                    <div>
                      <b>El router se está reiniciando…</b>
                      <br />
                      Winbox se reconecta en {rebooting.seconds} s
                      {rebooting.note && (
                        <>
                          <br />
                          <small>{rebooting.note}</small>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fullscreen Docked Panel */}
            {isFullScreen && fsPanel && (
              <div className="fs-dock">
                <div
                  className="tt"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#e4e8ec',
                    borderBottom: '1px solid var(--ln)',
                    padding: '0.25rem 0.6rem',
                  }}
                >
                  <b style={{ color: '#000' }}>
                    {fsPanel === 'revisor' && '📋 Revisor de Configuración'}
                    {fsPanel === 'guia' && `📖 Guía de comandos para ${cur}`}
                    {fsPanel === 'mapa' && '🗺 Mapa interactivo de la topología'}
                    {fsPanel === 'cables' && '🔌 Cables físicos (corte y redundancia)'}
                  </b>
                  <button
                    onClick={() => setFsPanel(null)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontWeight: 700,
                      color: '#000',
                    }}
                  >
                    ✕ Cerrar
                  </button>
                </div>
                <div style={{ maxHeight: '35vh', overflow: 'auto', background: 'var(--win)', padding: '0.4rem' }}>
                  {fsPanel === 'revisor' && renderRevisorContent()}
                  {fsPanel === 'guia' && renderGuiaContent()}
                  {fsPanel === 'mapa' && renderMapaContent()}
                  {fsPanel === 'cables' && renderCablesContent()}
                </div>
              </div>
            )}

            {/* Status bar */}
            <div className="sbar" id="st">
              {statusMsg}
            </div>
          </div>

          {/* Revisor Section (Normal view) */}
          {!isFullScreen && (
            <div className="wb">
              <div className="tt">
                <span>Revisor: compara lo que escribiste con la guía</span>
              </div>
              {renderRevisorContent()}
            </div>
          )}

          {/* Guía del router elegido (Normal view) */}
          {!isFullScreen && (
            <details open>
              <summary>
                <b>Guía del router elegido</b> (los comandos de tu HTML)
              </summary>
              {renderGuiaContent()}
            </details>
          )}
        </div>
      )}

      {/* Network Map SVG (#mp) (Normal view) */}
      {!isFullScreen && (
        <div className="wb" id="mp" hidden={!showMap}>
          <div className="tt">
            <span>Mapa de la red: se va armando mientras configuras</span>
          </div>
          {renderMapaContent()}
        </div>
      )}

      {/* Cables físicos (#cb) (Normal view) */}
      {!isFullScreen && (
        <div className="wb">
          <div className="tt">
            <span>Cables físicos: corta uno para probar el respaldo</span>
          </div>
          {renderCablesContent()}
        </div>
      )}

      {/* Full Guide Modal */}
      {showFullGuideModal && renderFullGuideModal()}
    </main>
  );

  function renderRevisorContent() {
    return (
      <div className="c" id="rv" aria-live="polite">
        <b>{cur}:</b>{' '}
        {reviewResult.o.filter(x => x.st === 'ok').length} correctos ·{' '}
        <span className="eb2">
          {reviewResult.o.filter(x => x.st === 'bad').length} errores
        </span>{' '}
        · {reviewResult.o.filter(x => x.st === 'wait').length} pendientes
        {/* Bad list */}
        {reviewResult.o.some(x => x.st === 'bad') && (
          <ul className="eb">
            {reviewResult.o
              .filter(x => x.st === 'bad')
              .map((item, idx) => (
                <li key={idx}>{item.t}</li>
              ))}
          </ul>
        )}
        {/* Wait list */}
        {reviewResult.o.some(x => x.st === 'wait') && (
          <ul className="wt">
            {reviewResult.o
              .filter(x => x.st === 'wait')
              .map((item, idx) => (
                <li key={idx}>{item.t}</li>
              ))}
          </ul>
        )}
        {/* OK details */}
        {reviewResult.o.some(x => x.st === 'ok') && (
          <details>
            <summary>Ver lo que ya está bien</summary>
            <ul>
              {reviewResult.o
                .filter(x => x.st === 'ok')
                .map((item, idx) => (
                  <li key={idx}>{item.t}</li>
                ))}
            </ul>
          </details>
        )}
      </div>
    );
  }

  function renderStepTextWithBadges(text: string) {
    const parts = text.split(/(172\.16\.\d+\.\d+(?:\/\d+)?|192\.168\.\d+\.\d+(?:\/\d+)?|255\.255\.255\.0|8\.8\.8\.8|1\.1\.1\.1|0\.0\.0\.0\/0|ether[1-4]|\bOK\b|\bStart\b|\bStop\b|\bAceptar\b)/g);
    return parts.map((part, i) => {
      if (/^(172\.16\.\d+\.\d+(?:\/\d+)?|192\.168\.\d+\.\d+(?:\/\d+)?|255\.255\.255\.0|8\.8\.8\.8|1\.1\.1\.1|0\.0\.0\.0\/0)$/.test(part)) {
        const isCopied = copiedId === `ip-${part}`;
        return (
          <code
            key={i}
            className={`code-ip ${isCopied ? 'ok' : ''}`}
            title="Haz clic para copiar esta IP"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(part, `ip-${part}`);
            }}
            style={{
              cursor: 'pointer',
              background: isCopied ? '#1f6f4a' : '#eef5f1',
              color: isCopied ? '#fff' : '#0f3d27',
              border: '1px solid #1f6f4a',
              padding: '1px 5px',
              borderRadius: '4px',
              margin: '0 2px',
              fontFamily: 'ui-monospace, Consolas, monospace',
              fontWeight: 600,
            }}
          >
            {isCopied ? '✓ ¡Copiado!' : part}
          </code>
        );
      }
      if (/^ether[1-4]$/.test(part)) {
        return (
          <code
            key={i}
            className="code-if"
            style={{
              background: '#f0f2f5',
              border: '1px solid #c9d1cc',
              padding: '1px 5px',
              borderRadius: '4px',
              margin: '0 2px',
              fontFamily: 'ui-monospace, Consolas, monospace',
            }}
          >
            {part}
          </code>
        );
      }
      if (/^(OK|Start|Stop|Aceptar)$/.test(part)) {
        return <b key={i} style={{ color: '#111' }}>{part}</b>;
      }
      return part;
    });
  }

  function renderGuiaContent() {
    const isCopied = copiedId === `cur-${cur}`;
    const activeTab = (wbGuideTab || cur) as 'R1' | 'R2' | 'R3';
    const steps = GUIDE_FULL.winboxSteps[activeTab];

    const copyStepsText = () => {
      const text = steps.map((s, idx) => `${idx + 1}. ${s.text}`).join('\n');
      copyToClipboard(text, `steps-${activeTab}`);
    };

    return (
      <div className="c">
        {/* Title and Action bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.6rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
            borderBottom: '1px solid #d0d7de',
            paddingBottom: '0.5rem',
          }}
        >
          <div>
            <b style={{ fontSize: '13.5px', color: '#143825' }}>
              Alternativa a los Pasos 2, 3 y 4: configuración sencilla en Winbox
            </b>
            <div className="mu" style={{ fontSize: '11px', marginTop: '2px' }}>
              Es la configuración que ya practicamos y funcionó. Pulsa <b>OK</b> en cada ventana: si la dejas abierta, no se guarda. Solo las direcciones IP se copian: haz clic en una. Toca un paso para marcarlo como hecho.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => printWinboxGuidePdf()}
              title="Descargar o imprimir la guía paso a paso completa en documento PDF (R1, R2 y R3)"
              style={{
                fontWeight: 600,
                background: '#1f6f4a',
                color: '#fff',
                borderColor: '#1f6f4a',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0.2rem 0.65rem',
              }}
            >
              📄 Descargar Guía en PDF
            </button>
            <button
              onClick={copyStepsText}
              style={{
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: copiedId === `steps-${activeTab}` ? '#238636' : undefined,
                color: copiedId === `steps-${activeTab}` ? '#fff' : undefined,
                padding: '0.2rem 0.65rem',
              }}
            >
              {copiedId === `steps-${activeTab}` ? '✓ ¡Pasos Copiados!' : `📋 Copiar pasos de ${activeTab}`}
            </button>
            <button
              onClick={() => setGuideMode(guideMode === 'winbox' ? 'cli' : 'winbox')}
              style={{ padding: '0.2rem 0.6rem' }}
            >
              {guideMode === 'winbox' ? '💻 Ver script Terminal' : '🖱️ Ver pasos Winbox'}
            </button>
          </div>
        </div>

        {guideMode === 'winbox' ? (
          <div>
            {/* Tabs for R1, R2, R3 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
              {(['R1', 'R2', 'R3'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setWbGuideTab(tab)}
                  style={{
                    fontWeight: 700,
                    padding: '0.35rem 1.1rem',
                    background: activeTab === tab ? '#1f6f4a' : '#fff',
                    color: activeTab === tab ? '#fff' : '#111',
                    borderColor: activeTab === tab ? '#1f6f4a' : '#c0c8d0',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                >
                  {tab}
                </button>
              ))}
              <button
                onClick={() => setDoneSteps({})}
                style={{
                  marginLeft: 'auto',
                  fontSize: '11px',
                  background: '#fff',
                  border: '1px solid #c0c8d0',
                  borderRadius: '4px',
                  padding: '0.25rem 0.6rem',
                }}
              >
                Reiniciar pasos
              </button>
            </div>

            {/* List of Steps matching image.png */}
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {steps.map((st, idx) => {
                const key = `${activeTab}-${idx}`;
                const isDone = !!doneSteps[key];
                return (
                  <li
                    key={key}
                    onClick={() => setDoneSteps(prev => ({ ...prev, [key]: !prev[key] }))}
                    style={{
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'flex-start',
                      padding: '0.5rem 0.2rem',
                      borderBottom: '1px solid #e1e7e3',
                      cursor: 'pointer',
                      opacity: isDone ? 0.55 : 1,
                    }}
                  >
                    <span
                      style={{
                        flex: 'none',
                        width: '1.7rem',
                        height: '1.7rem',
                        borderRadius: '50%',
                        background: isDone ? '#1f6f4a' : '#fff',
                        border: '1px solid #1f6f4a',
                        color: isDone ? '#fff' : '#1f6f4a',
                        fontWeight: 700,
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        marginTop: '1px',
                      }}
                    >
                      {isDone ? '✓' : idx + 1}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        textDecoration: isDone ? 'line-through' : 'none',
                        fontSize: '13px',
                        lineHeight: 1.5,
                      }}
                    >
                      {renderStepTextWithBadges(st.text)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span className="mu">Comandos directos de consola CLI para {cur}:</span>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  onClick={() => copyToClipboard(G[cur], `cur-${cur}`)}
                  style={{
                    background: isCopied ? '#238636' : undefined,
                    color: isCopied ? '#fff' : undefined,
                  }}
                >
                  {isCopied ? '✓ ¡Copiado!' : '📋 Copiar comandos'}
                </button>
                <button onClick={() => downloadRouterScript(cur, G[cur])}>
                  📥 Descargar .rsc
                </button>
              </div>
            </div>
            <pre className="o" id="gp" style={{ height: 'auto', maxHeight: '13rem' }}>
              {G[cur]}
            </pre>
          </div>
        )}

        <div className="tl" style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button id="gt" onClick={handlePasteGuide}>
            Pegar en Terminal
          </button>
          <button
            onClick={() => setShowFullGuideModal(true)}
            style={{ fontWeight: 600, background: '#eef2f6', border: '1px solid #c0c8d0' }}
          >
            📑 Ver Guía Completa de Examen (Paso a Paso)
          </button>
        </div>
      </div>
    );
  }

  function renderFullGuideModal() {
    const g = GUIDE_FULL;
    return (
      <div
        className="guide-overlay"
        onClick={() => setShowFullGuideModal(false)}
      >
        <div
          className="guide-card"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="guide-header">
            <span>📑 Guía de Estudio y Examen: R1, R2 y R3</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => printWinboxGuidePdf()}
                title="Descargar la guía paso a paso completa en documento PDF (R1, R2 y R3)"
                style={{
                  background: '#238636',
                  color: '#fff',
                  border: 'none',
                  padding: '0.25rem 0.75rem',
                  fontWeight: 600,
                  fontSize: '12px',
                  borderRadius: '4px',
                }}
              >
                📄 Descargar Guía en PDF
              </button>
              <button
                onClick={() => setShowFullGuideModal(false)}
                style={{
                  background: 'transparent',
                  color: '#fff',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '0 0.3rem',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="guide-body">
            <h1 style={{ fontSize: '1.35rem', margin: '0 0 0.4rem', color: '#0969da' }}>{g.title}</h1>
            <p style={{ margin: '0 0 0.4rem', color: '#444' }}><b>Resumen:</b> {g.subtitle}</p>
            <p className="mu" style={{ margin: '0 0 0.8rem', fontSize: '12px' }}><b>Cables físicos:</b> {g.cablesNotes}</p>

            {/* Paso 1 */}
            <h2>Paso 1: Resetear (en cada router)</h2>
            <p>Winbox, pestaña Neighbors, entrar por MAC (admin, sin contraseña). Abrir New Terminal y pegar:</p>
            <div className="guide-block">
              <pre><code>{g.step1Reset}</code></pre>
              <button
                className={`guide-copy-btn ${copiedId === 'p1' ? 'ok' : ''}`}
                onClick={() => copyToClipboard(g.step1Reset, 'p1')}
              >
                {copiedId === 'p1' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="mu">Esperar 30 s y volver a entrar por MAC. Si pide "new password", presionar Enter para omitirlo.</p>

            {/* Paso 2 */}
            <h2>Paso 2: Pegar R1 (hacerlo primero)</h2>
            <div className="guide-block">
              <pre><code>{g.step2R1}</code></pre>
              <button
                className={`guide-copy-btn ${copiedId === 'p2' ? 'ok' : ''}`}
                onClick={() => copyToClipboard(g.step2R1, 'p2')}
              >
                {copiedId === 'p2' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>

            {/* Paso 3 */}
            <h2>Paso 3: Pegar R2</h2>
            <div className="guide-block">
              <pre><code>{g.step3R2}</code></pre>
              <button
                className={`guide-copy-btn ${copiedId === 'p3' ? 'ok' : ''}`}
                onClick={() => copyToClipboard(g.step3R2, 'p3')}
              >
                {copiedId === 'p3' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>

            {/* Paso 4 */}
            <h2>Paso 4: Pegar R3</h2>
            <div className="guide-block">
              <pre><code>{g.step4R3}</code></pre>
              <button
                className={`guide-copy-btn ${copiedId === 'p4' ? 'ok' : ''}`}
                onClick={() => copyToClipboard(g.step4R3, 'p4')}
              >
                {copiedId === 'p4' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="mu">Las líneas con <code>distance=2</code> son el respaldo por si quitan un cable.</p>

            {/* Alternativa WinBox */}
            <h2>Alternativa a los Pasos 2, 3 y 4: configuración sencilla en Winbox</h2>
            <p className="mu">Toca cualquier paso para marcarlo como completado. Pulsa en las IPs para copiarlas al portapapeles.</p>
            <div className="guide-tablist">
              {(['R1', 'R2', 'R3'] as const).map(tab => (
                <button
                  key={tab}
                  className={wbGuideTab === tab ? 'on' : ''}
                  onClick={() => setWbGuideTab(tab)}
                >
                  {tab}
                </button>
              ))}
              <button
                onClick={() => setDoneSteps({})}
                style={{ marginLeft: 'auto', fontSize: '11px' }}
              >
                Reiniciar pasos
              </button>
            </div>

            <ul className="guide-step-list">
              {g.winboxSteps[wbGuideTab].map((stepItem, idx) => {
                const key = `${wbGuideTab}-${idx}`;
                const isDone = !!doneSteps[key];
                return (
                  <li
                    key={key}
                    className={isDone ? 'done' : ''}
                    onClick={() => setDoneSteps(prev => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <span className="guide-step-num">{isDone ? '✓' : idx + 1}</span>
                    <span>{renderStepTextWithBadges(stepItem.text)}</span>
                  </li>
                );
              })}
            </ul>

            {/* Paso 5 */}
            <h2>Paso 5: Armar el triángulo</h2>
            <p>Conectar los cables entre routers de la lista. La PC queda en el ether4 del router que se vaya a probar.</p>

            {/* Paso 6 */}
            <h2>Paso 6: Internet para la PC (prueba del buscador)</h2>
            <p>El cable de la PC va siempre al <b>puerto ether4</b> del router que se prueba. Cada vez que cambies el cable de router, cambia también la IP de la PC:</p>
            <table>
              <thead>
                <tr>
                  <th>Cable en ether4 de</th>
                  <th>IP de la PC</th>
                  <th>Máscara</th>
                  <th>Puerta de enlace</th>
                  <th>DNS</th>
                </tr>
              </thead>
              <tbody>
                {g.pcTable.map(row => (
                  <tr key={row.router}>
                    <td><b>{row.router}</b></td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.ip}</td>
                    <td style={{ fontFamily: 'monospace' }}>{row.mask}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.gw}</td>
                    <td style={{ fontFamily: 'monospace' }}>{row.dns}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paso 7 */}
            <h2>Paso 7: Comandos de Verificación (MikroTik CLI)</h2>
            <p><b>Verificar R1:</b></p>
            <div className="guide-block">
              <pre><code>{g.verifyR1}</code></pre>
              <button
                className={`guide-copy-btn ${copiedId === 'vr1' ? 'ok' : ''}`}
                onClick={() => copyToClipboard(g.verifyR1, 'vr1')}
              >
                {copiedId === 'vr1' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>

            <p><b>Verificar R2:</b></p>
            <div className="guide-block">
              <pre><code>{g.verifyR2}</code></pre>
              <button
                className={`guide-copy-btn ${copiedId === 'vr2' ? 'ok' : ''}`}
                onClick={() => copyToClipboard(g.verifyR2, 'vr2')}
              >
                {copiedId === 'vr2' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>

            <p><b>Verificar R3:</b></p>
            <div className="guide-block">
              <pre><code>{g.verifyR3}</code></pre>
              <button
                className={`guide-copy-btn ${copiedId === 'vr3' ? 'ok' : ''}`}
                onClick={() => copyToClipboard(g.verifyR3, 'vr3')}
              >
                {copiedId === 'vr3' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>

            {/* Paso 8 */}
            <h2>Paso 8: Si el profesor quita un cable (Prueba de Respaldo)</h2>
            <p>Quitar el cable de R1 ether2 con R2 ether2 y, en R2:</p>
            <div className="guide-block">
              <pre><code>{g.failoverTest}</code></pre>
              <button
                className={`guide-copy-btn ${copiedId === 'pfail' ? 'ok' : ''}`}
                onClick={() => copyToClipboard(g.failoverTest, 'pfail')}
              >
                {copiedId === 'pfail' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="mu">Debe responder y conmutar el salto por 172.16.23.3 (R3).</p>

            {/* Extra */}
            <h2>Extra: Si algo falla</h2>
            <ul>
              <li><b>R1 sin bound:</b> revisar que el cable del switch esté en ether1.</li>
              <li><b>R2 o R3 sin Internet:</b> revisar el gateway de la ruta 0.0.0.0/0 con <code>/ip route print</code>.</li>
              <li><b>1.1.1.1 responde pero google.com no:</b> problema de DNS, revisar <code>/ip dns print</code>.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  function renderMapaContent() {
    return (
      <div className="c" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: '560px', maxHeight: '240px', margin: '0 auto' }}>
          <svg
            viewBox="0 0 760 380"
            style={{ width: '100%', maxHeight: '240px', height: 'auto', display: 'block' }}
            role="img"
            aria-label="Mapa físico de R1, R2 y R3 con sus puertos y el switch con Internet"
          >
            {/* Links */}
            {renderMapLinks()}

            {/* Switch e Internet */}
            <g id="n-NET">
              <rect className="nd" x="20" y="320" width="240" height="40" rx="8" />
              <text className="nt" x="140" y="340">
                Switch e Internet
              </text>
            </g>

            {/* Router Nodes */}
            {[
              { id: 'R1', x: 40 },
              { id: 'R2', x: 300 },
              { id: 'R3', x: 560 },
            ].map(r => {
              const isSelected = r.id === cur;
              return (
                <g key={r.id} id={`n-${r.id}`}>
                  <rect
                    className={`nd ${isSelected ? 'on' : ''}`}
                    x={r.x}
                    y="110"
                    width="160"
                    height="60"
                    rx="8"
                  />
                  <text className="nt" x={r.x + 80} y="130">
                    {r.id}
                  </text>

                  {/* Ports 1..4 */}
                  {[0, 1, 2, 3].map(k => {
                    const px = r.x + 16 + k * 34;
                    const addr = AD(r.id).find(x => x.i === `ether${k + 1}`);
                    const octet = addr ? '.' + addr.v.split('/')[0].split('.')[3] : String(k + 1);
                    return (
                      <g key={k}>
                        <rect
                          className={`pt ${addr ? 'on' : ''}`}
                          x={px}
                          y="148"
                          width="26"
                          height="18"
                          rx="3"
                        />
                        <text
                          className={`lb ${addr ? 'w' : ''}`}
                          x={px + 13}
                          y="157"
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          {octet}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Link Text Labels */}
            {renderMapLabels()}
          </svg>
        </div>
        <p className="mu" style={{ fontSize: '11px', textAlign: 'center', margin: '0.3rem 0 0', maxWidth: '640px' }}>
          Cable verde: listo (misma red en los dos extremos). Naranja: falta la IP en un extremo. Rojo
          continuo: las redes no coinciden. Rojo punteado: cortado. Gris punteado: sin configurar. El
          borde azul marca el router al que estás conectado.
        </p>
      </div>
    );
  }

  function renderCablesContent() {
    return (
      <div className="c" id="cb">
        <table>
          <thead>
            <tr>
              <th>Cable</th>
              <th>Estado</th>
              <th>Cortar</th>
            </tr>
          </thead>
          <tbody>
            {L.map(l => {
              let statusText = '';
              if (cut[l.id]) {
                statusText = 'cortado';
              } else if (l.id === 'net') {
                statusText = S.R1.d.some(d => bound('R1', d))
                  ? 'ok · R1 recibió IP del ISP'
                  : 'conectado · falta DHCP Client en R1';
              } else {
                const A = AD(l.a[0]).find(x => x.i === l.a[1]);
                const B = AD(l.b[0]).find(x => x.i === l.b[1]);
                if (!A && !B) {
                  statusText = 'sin IP en ningún extremo';
                } else if (!A || !B) {
                  statusText = 'falta la IP en ' + (A ? l.b[0] : l.a[0]);
                } else {
                  const q = pa(A.v);
                  if (q && inn(B.v.split('/')[0], q.a, q.p)) {
                    statusText = 'ok · red ' + net(q.a, q.p) + '/' + q.p;
                  } else {
                    statusText = 'las redes no coinciden';
                  }
                }
              }
              return (
                <tr key={l.id}>
                  <td>{CN[l.id].join(' ↔ ')}</td>
                  <td>{statusText}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!cut[l.id]}
                      aria-label={`Cortar cable ${CN[l.id].join(' a ')}`}
                      onChange={e => {
                        setCut(prev => ({ ...prev, [l.id]: e.target.checked }));
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Helper for rendering SVG map links
  function renderMapLinks() {
    return (
      <>
        {/* k-net */}
        <path
          className={`lk ${getLinkClass('net')}`}
          id="k-net"
          d="M69 166V320"
        />
        {/* k-12 */}
        <path
          className={`lk ${getLinkClass('12')}`}
          id="k-12"
          d="M103 166V215H363V166"
        />
        {/* k-13 */}
        <path
          className={`lk ${getLinkClass('13')}`}
          id="k-13"
          d="M137 166V245H623V166"
        />
        {/* k-23 */}
        <path
          className={`lk ${getLinkClass('23')}`}
          id="k-23"
          d="M397 166V215H657V166"
        />
      </>
    );
  }

  function getLinkClass(linkId: string) {
    const l = L.find(x => x.id === linkId);
    if (!l) return '';
    if (cut[linkId]) return 'cut';
    const A = AD(l.a[0]).find(x => x.i === l.a[1]);
    const B = l.b[0] === 'NET' ? undefined : AD(l.b[0]).find(x => x.i === l.b[1]);
    if (linkId === 'net') {
      if (A) return 'up';
      if (S.R1.d.length) return 'half';
      return '';
    }
    if (A && B) {
      const q = pa(A.v);
      if (q && inn(B.v.split('/')[0], q.a, q.p)) return 'up';
      return 'bad';
    }
    if (A || B) return 'half';
    return '';
  }

  function renderMapLabels() {
    const getLinkText = (linkId: string) => {
      const l = L.find(x => x.id === linkId);
      if (!l || cut[linkId]) return '';
      const A = AD(l.a[0]).find(x => x.i === l.a[1]);
      const B = l.b[0] === 'NET' ? undefined : AD(l.b[0]).find(x => x.i === l.b[1]);
      if (linkId === 'net') {
        if (A) return 'ISP 203.0.113.0/24';
        return '';
      }
      if (A && B) {
        const q = pa(A.v);
        if (q && inn(B.v.split('/')[0], q.a, q.p)) return `${net(q.a, q.p)}/${q.p}`;
      }
      return '';
    };

    return (
      <>
        <text className="lb" id="lb-net" x="78" y="292">
          {getLinkText('net')}
        </text>
        <text className="lb" id="lb-12" x="233" y="208" textAnchor="middle">
          {getLinkText('12')}
        </text>
        <text className="lb" id="lb-13" x="380" y="264" textAnchor="middle">
          {getLinkText('13')}
        </text>
        <text className="lb" id="lb-23" x="527" y="208" textAnchor="middle">
          {getLinkText('23')}
        </text>
      </>
    );
  }

  // Window renderer dispatcher
  function renderWindowContent(win: WindowInstance) {
    switch (win.type) {
      case 'if':
        return <InterfacesWindow cur={cur} peer={peer} run={run} />;
      case 'ad':
        return (
          <AddressListWindow
            cur={cur}
            addresses={AD(cur)}
            badSet={reviewResult.bad}
            onAdd={() => openWindow('new_addr')}
            onEdit={item => openWindow('edit_addr', { item, key: item.v })}
            onRemove={item => {
              if (item.dyn) {
                setStatusMsg('Entrada dinámica: no se puede quitar a mano.');
                return;
              }
              setS(prev => ({
                ...prev,
                [cur]: { ...prev[cur], a: prev[cur].a.filter(x => x !== item) },
              }));
            }}
          />
        );
      case 'new_addr':
      case 'edit_addr':
        return (
          <AddressDialog
            isEdit={win.type === 'edit_addr'}
            item={win.data?.item}
            onClose={() => closeWindow(win.id)}
            onSave={(addr, iface) => {
              const res = win.type === 'edit_addr'
                ? editAddress(win.data.item, addr, iface)
                : executeCommand(`/ip address add address=${addr} interface=${iface}`);
              if (res.length > 0) return res[0];
              closeWindow(win.id);
              return null;
            }}
            onRemove={
              win.type === 'edit_addr'
                ? () => {
                    setS(prev => ({
                      ...prev,
                      [cur]: { ...prev[cur], a: prev[cur].a.filter(x => x !== win.data.item) },
                    }));
                    closeWindow(win.id);
                  }
                : undefined
            }
          />
        );
      case 'rt':
        return (
          <RouteListWindow
            v7={v7}
            routes={getRtab(cur)}
            badSet={reviewResult.bad}
            onAdd={() => openWindow('new_route')}
            onEdit={item => openWindow('edit_route', { item, key: `${item.d}-${item.g}` })}
            onRemove={item => {
              if (item.dyn) {
                setStatusMsg('Entrada dinámica: no se puede quitar a mano.');
                return;
              }
              setS(prev => ({
                ...prev,
                [cur]: { ...prev[cur], r: prev[cur].r.filter(x => x !== item) },
              }));
            }}
          />
        );
      case 'new_route':
      case 'edit_route':
        return (
          <RouteDialog
            v7={v7}
            isEdit={win.type === 'edit_route'}
            item={win.data?.item}
            onClose={() => closeWindow(win.id)}
            onSave={(dst, gw, dist) => {
              const res = win.type === 'edit_route'
                ? editRoute(win.data.item, dst, gw, dist)
                : executeCommand(`/ip route add dst-address=${dst} gateway=${gw} distance=${dist}`);
              if (res.length > 0) return res[0];
              closeWindow(win.id);
              return null;
            }}
            onRemove={
              win.type === 'edit_route'
                ? () => {
                    setS(prev => ({
                      ...prev,
                      [cur]: { ...prev[cur], r: prev[cur].r.filter(x => x !== win.data.item) },
                    }));
                    closeWindow(win.id);
                  }
                : undefined
            }
          />
        );
      case 'dh':
        return (
          <DhcpClientWindow
            cur={cur}
            dhcpClients={S[cur].d}
            boundFn={bound}
            badSet={reviewResult.bad}
            onAdd={() => openWindow('new_dhcp')}
            onEdit={item => openWindow('edit_dhcp', { item, key: item.i })}
            onRemove={item => {
              setS(prev => ({
                ...prev,
                [cur]: { ...prev[cur], d: prev[cur].d.filter(x => x !== item) },
              }));
            }}
          />
        );
      case 'new_dhcp':
      case 'edit_dhcp':
        return (
          <DhcpDialog
            v7={v7}
            isEdit={win.type === 'edit_dhcp'}
            item={win.data?.item}
            boundState={win.data?.item ? bound(cur, win.data.item) : false}
            onClose={() => closeWindow(win.id)}
            onSave={(iface, addDef) => {
              const res = win.type === 'edit_dhcp'
                ? editDhcp(win.data.item, iface, addDef)
                : executeCommand(`/ip dhcp-client add interface=${iface} add-default-route=${addDef ? 'yes' : 'no'}`);
              if (res.length > 0) return res[0];
              closeWindow(win.id);
              return null;
            }}
            onRemove={
              win.type === 'edit_dhcp'
                ? () => {
                    setS(prev => ({
                      ...prev,
                      [cur]: { ...prev[cur], d: prev[cur].d.filter(x => x !== win.data.item) },
                    }));
                    closeWindow(win.id);
                  }
                : undefined
            }
          />
        );
      case 'fw':
        return (
          <FirewallWindow
            natRules={S[cur].n}
            badSet={reviewResult.bad}
            onAdd={() => openWindow('new_nat')}
            onEdit={item => openWindow('edit_nat', { item, key: `${item.chain}-${item.out}` })}
            onRemove={item => {
              setS(prev => ({
                ...prev,
                [cur]: { ...prev[cur], n: prev[cur].n.filter(x => x !== item) },
              }));
            }}
          />
        );
      case 'new_nat':
      case 'edit_nat':
        return (
          <NatDialog
            isEdit={win.type === 'edit_nat'}
            item={win.data?.item}
            onClose={() => closeWindow(win.id)}
            onSave={(chain, outIface, action) => {
              const res = win.type === 'edit_nat'
                ? editNat(win.data.item, chain, outIface, action)
                : executeCommand(`/ip firewall nat add chain=${chain} out-interface=${outIface} action=${action}`);
              if (res.length > 0) return res[0];
              closeWindow(win.id);
              return null;
            }}
            onRemove={
              win.type === 'edit_nat'
                ? () => {
                    setS(prev => ({
                      ...prev,
                      [cur]: { ...prev[cur], n: prev[cur].n.filter(x => x !== win.data.item) },
                    }));
                    closeWindow(win.id);
                  }
                : undefined
            }
          />
        );
      case 'dn':
        return (
          <DnsDialog
            dns={S[cur].dns}
            hasDhcpBound={S[cur].d.some(x => bound(cur, x))}
            onClose={() => closeWindow(win.id)}
            onSave={newDns => {
              setS(prev => ({
                ...prev,
                [cur]: { ...prev[cur], dns: newDns },
              }));
              closeWindow(win.id);
            }}
          />
        );
      case 'id':
        return (
          <IdentityDialog
            identity={S[cur].id}
            onClose={() => closeWindow(win.id)}
            onSave={name => {
              if (!name.trim()) return 'failure: el nombre no puede estar vacío';
              setS(prev => ({
                ...prev,
                [cur]: { ...prev[cur], id: name.trim() },
              }));
              closeWindow(win.id);
              return null;
            }}
          />
        );
      case 'rs':
        return (
          <ResetConfigDialog
            onClose={() => closeWindow(win.id)}
            onReset={noDefault => {
              closeWindow(win.id);
              setS(prev => ({ ...prev, [cur]: mkRouter() }));
              triggerReboot(
                cur,
                noDefault
                  ? ''
                  : 'Sin marcar "No Default Configuration", el router cargaría la configuración por defecto (192.168.88.1). El simulador lo deja vacío.'
              );
            }}
          />
        );
      case 'pg':
        return <PingWindow v7={v7} onPing={(target, count) => pingLines(cur, target, count)} onClose={() => closeWindow(win.id)} />;
      case 'tm':
        return (
          <TerminalWindow
            cur={cur}
            identity={S[cur].id}
            ver={VER[cur]}
            autoRun={win.data?.autoRun}
            onExecute={line => executeCommand(line, cur)}
          />
        );
      default:
        return <div>Ventana no implementada</div>;
    }
  }

  // Edit address logic
  function editAddress(oldItem: AddressEntry, newAddr: string, newIface: string): string[] {
    const q = newAddr && pa(newAddr);
    if (!q || newAddr.indexOf('/') < 0) return ['failure: invalid value for argument address'];
    if (S[cur].a.some(y => y !== oldItem && y.v === newAddr)) {
      return ['failure: already have such address'];
    }
    setS(prev => ({
      ...prev,
      [cur]: {
        ...prev[cur],
        a: prev[cur].a.map(x => (x === oldItem ? { ...x, v: newAddr, i: newIface } : x)),
      },
    }));
    return [];
  }

  // Edit route logic
  function editRoute(oldItem: RouteEntry, newDst: string, newGw: string, newDist: number): string[] {
    if (!pa(newDst) || newDst.indexOf('/') < 0) return ['failure: invalid value for argument dst-address'];
    if (!V(newGw)) return ['failure: invalid value for argument gateway'];
    if (S[cur].r.some(y => y !== oldItem && y.d === newDst && y.g === newGw && y.dist === newDist)) {
      return ['failure: already have such entry'];
    }
    setS(prev => ({
      ...prev,
      [cur]: {
        ...prev[cur],
        r: prev[cur].r.map(x => (x === oldItem ? { ...x, d: newDst, g: newGw, dist: newDist } : x)),
      },
    }));
    return [];
  }

  // Edit DHCP logic
  function editDhcp(oldItem: DhcpEntry, newIface: string, newAddDef: boolean): string[] {
    if (S[cur].d.some(y => y !== oldItem && y.i === newIface)) {
      return ['failure: already have such entry'];
    }
    setS(prev => ({
      ...prev,
      [cur]: {
        ...prev[cur],
        d: prev[cur].d.map(x => (x === oldItem ? { ...x, i: newIface, def: newAddDef } : x)),
      },
    }));
    return [];
  }

  // Edit NAT logic
  function editNat(oldItem: NatEntry, newChain: string, newOut: string, newAction: string): string[] {
    setS(prev => ({
      ...prev,
      [cur]: {
        ...prev[cur],
        n: prev[cur].n.map(x => (x === oldItem ? { ...x, chain: newChain, out: newOut, action: newAction } : x)),
      },
    }));
    return [];
  }
}

// -------------------------------------------------------------
// Component Windows
// -------------------------------------------------------------

function InterfacesWindow({ cur, peer, run }: { cur: string; peer: any; run: any }) {
  const [selected, setSelected] = useState<number>(-1);
  const rows = IFS.map(i => {
    const p = peer(cur, i);
    const cableStatus = !p
      ? 'sin cable'
      : p.dead
      ? 'cortado'
      : p.node === 'NET'
      ? 'Switch / Internet'
      : `${p.node} ${p.iface}`;
    return {
      running: run(cur, i) ? 'R' : '',
      name: i,
      type: 'Ethernet',
      cable: cableStatus,
    };
  });

  return (
    <div>
      <div className="ls">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Type</th>
              <th>Cable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr
                key={k}
                className={selected === k ? 's' : ''}
                onClick={() => setSelected(k)}
              >
                <td>{r.running}</td>
                <td>{r.name}</td>
                <td>{r.type}</td>
                <td>{r.cable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stb">{rows.length} items</div>
    </div>
  );
}

function AddressListWindow({
  cur,
  addresses,
  badSet,
  onAdd,
  onEdit,
  onRemove,
}: {
  cur: string;
  addresses: AddressEntry[];
  badSet: Set<any>;
  onAdd: () => void;
  onEdit: (item: AddressEntry) => void;
  onRemove: (item: AddressEntry) => void;
}) {
  const [selected, setSelected] = useState<number>(-1);

  return (
    <div>
      <div className="tl">
        <button className="ad tbtn" aria-label="Agregar" onClick={onAdd}>
          +
        </button>
        <button
          className="dl tbtn"
          aria-label="Quitar"
          onClick={() => {
            if (selected >= 0 && selected < addresses.length) {
              onRemove(addresses[selected]);
              setSelected(-1);
            }
          }}
        >
          −
        </button>
        <button className="tbtn" disabled>
          ✔
        </button>
        <button className="tbtn" disabled>
          ✖
        </button>
        <button className="tbtn" disabled>
          ▤
        </button>
        <input type="text" className="fd" placeholder="Find" aria-label="Find" disabled />
      </div>
      <div className="ls">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Address</th>
              <th>Network</th>
              <th>Interface</th>
            </tr>
          </thead>
          <tbody>
            {addresses.map((x, k) => {
              const q = pa(x.v);
              const isBad = badSet.has(x);
              return (
                <tr
                  key={k}
                  className={`${selected === k ? 's ' : ''}${isBad ? 'e' : ''}`}
                  onClick={() => setSelected(k)}
                  onDoubleClick={() => !x.dyn && onEdit(x)}
                >
                  <td>{x.dyn ? 'D' : ''}</td>
                  <td>
                    <i className="ya"></i>
                    {x.v}
                  </td>
                  <td>{q ? net(q.a, q.p) : ''}</td>
                  <td>{x.i}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="stb">{addresses.length} item{addresses.length === 1 ? '' : 's'}</div>
    </div>
  );
}

function AddressDialog({
  isEdit,
  item,
  onClose,
  onSave,
  onRemove,
}: {
  isEdit: boolean;
  item?: AddressEntry;
  onClose: () => void;
  onSave: (addr: string, iface: string) => string | null;
  onRemove?: () => void;
}) {
  const [address, setAddress] = useState<string>(item?.v || '');
  const [iface, setIface] = useState<string>(item?.i || 'ether2');
  const [error, setError] = useState<string>('');

  const q = address ? pa(address) : null;
  const network = q ? net(q.a, q.p) : '';

  const handleOk = () => {
    const err = onSave(address.trim(), iface);
    if (err) setError(err);
  };

  return (
    <div>
      <div className="dlg">
        <div className="dl2">
          <div className="fr">
            <label htmlFor="f-addr">Address</label>
            <input
              type="text"
              id="f-addr"
              value={address}
              onChange={e => setAddress(e.target.value)}
              autoComplete="off"
            />
            <label htmlFor="f-net">Network</label>
            <input type="text" id="f-net" value={network} disabled readOnly />
            <label htmlFor="f-if">Interface</label>
            <select
              id="f-if"
              value={iface}
              onChange={e => setIface(e.target.value)}
            >
              {IFS.map(i => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div className="er" aria-live="polite">
            {error}
          </div>
        </div>
        <div className="bt">
          <button className="ok" onClick={handleOk}>
            OK
          </button>
          <button className="cn" onClick={onClose}>
            Cancel
          </button>
          <button disabled>Apply</button>
          <button disabled>Disable</button>
          <button disabled>Comment</button>
          <button disabled>Copy</button>
          {isEdit && onRemove ? (
            <button className="rm" onClick={onRemove}>
              Remove
            </button>
          ) : (
            <button disabled>Remove</button>
          )}
        </div>
      </div>
      <div className="stb">
        <span>enabled</span>
      </div>
    </div>
  );
}

function RouteListWindow({
  v7,
  routes,
  badSet,
  onAdd,
  onEdit,
  onRemove,
}: {
  v7: boolean;
  routes: any[];
  badSet: Set<any>;
  onAdd: () => void;
  onEdit: (item: any) => void;
  onRemove: (item: any) => void;
}) {
  const [selected, setSelected] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<string>('Routes');

  return (
    <div>
      <div className="tabs">
        {['Routes', 'Nexthops', 'Rules', 'VRF'].map(tab => (
          <span
            key={tab}
            className={`tab ${activeTab === tab ? 'on' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="tl">
        <button className="ad tbtn" aria-label="Agregar" onClick={onAdd}>
          +
        </button>
        <button
          className="dl tbtn"
          aria-label="Quitar"
          onClick={() => {
            if (selected >= 0 && selected < routes.length) {
              const r = routes[selected];
              if (r.ref) {
                onRemove(r.ref);
                setSelected(-1);
              }
            }
          }}
        >
          −
        </button>
        <button className="tbtn" disabled>
          ✔
        </button>
        <button className="tbtn" disabled>
          ✖
        </button>
        <button className="tbtn" disabled>
          ▤
        </button>
        <input type="text" className="fd" placeholder="Find" aria-label="Find" disabled />
      </div>
      <div className="ls">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Dst. Address</th>
              <th>Gateway</th>
              <th>Distance</th>
              <th>{v7 ? 'Routing Table' : 'Routing Mark'}</th>
              <th>Pref. Source</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r, k) => {
              const isBad = r.ref && badSet.has(r.ref);
              const isActive = r.f.indexOf('A') >= 0;
              return (
                <tr
                  key={k}
                  className={`${selected === k ? 's ' : ''}${isBad ? 'e' : ''}`}
                  onClick={() => setSelected(k)}
                  onDoubleClick={() => r.ref && !r.ref.dyn && onEdit(r.ref)}
                >
                  <td>{r.f}</td>
                  <td>
                    {isActive && <i className="ga">▶ </i>}
                    {r.d}
                  </td>
                  <td>{r.g}</td>
                  <td>{r.k}</td>
                  <td>{v7 ? 'main' : ''}</td>
                  <td></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="stb">{routes.length} item{routes.length === 1 ? '' : 's'}</div>
    </div>
  );
}

function RouteDialog({
  v7,
  isEdit,
  item,
  onClose,
  onSave,
  onRemove,
}: {
  v7: boolean;
  isEdit: boolean;
  item?: RouteEntry;
  onClose: () => void;
  onSave: (dst: string, gw: string, dist: number) => string | null;
  onRemove?: () => void;
}) {
  const [dst, setDst] = useState<string>(item?.d || '0.0.0.0/0');
  const [gw, setGw] = useState<string>(item?.g || '');
  const [dist, setDist] = useState<string>(item?.dist !== undefined ? String(item.dist) : '1');
  const [error, setError] = useState<string>('');

  const handleOk = () => {
    const err = onSave(dst.trim(), gw.trim(), +(dist || 1));
    if (err) setError(err);
  };

  return (
    <div>
      <div className="dlg">
        <div className="dl2">
          <div className="fr">
            <label htmlFor="f-dst">Dst. Address</label>
            <input
              type="text"
              id="f-dst"
              value={dst}
              onChange={e => setDst(e.target.value)}
              autoComplete="off"
            />
            <label htmlFor="f-gw">Gateway</label>
            <input
              type="text"
              id="f-gw"
              value={gw}
              onChange={e => setGw(e.target.value)}
              autoComplete="off"
            />
            {v7 && (
              <>
                <label>Immediate Gateway</label>
                <input type="text" value="unknown" disabled readOnly />
                <label>Local Address</label>
                <input type="text" value="" disabled />
              </>
            )}
            <label>Check Gateway</label>
            <select disabled>
              <option></option>
            </select>
            {!v7 && (
              <>
                <label>Type</label>
                <input type="text" value="unicast" disabled readOnly />
              </>
            )}
            <label htmlFor="f-dist">Distance</label>
            <input
              type="text"
              id="f-dist"
              value={dist}
              onChange={e => setDist(e.target.value)}
              autoComplete="off"
            />
            <label>Scope</label>
            <input type="text" value="30" disabled />
            <label>Target Scope</label>
            <input type="text" value="10" disabled />
            {v7 && (
              <>
                <label>Routing Table</label>
                <input type="text" value="main" disabled readOnly />
              </>
            )}
            <label>Pref. Source</label>
            <input type="text" value="" disabled />
          </div>
          <div className="er" aria-live="polite">
            {error}
          </div>
        </div>
        <div className="bt">
          <button className="ok" onClick={handleOk}>
            OK
          </button>
          <button className="cn" onClick={onClose}>
            Cancel
          </button>
          <button disabled>Apply</button>
          <button disabled>Disable</button>
          <button disabled>Comment</button>
          <button disabled>Copy</button>
          {isEdit && onRemove ? (
            <button className="rm" onClick={onRemove}>
              Remove
            </button>
          ) : (
            <button disabled>Remove</button>
          )}
        </div>
      </div>
      <div className="stb">
        <span>enabled</span>
      </div>
    </div>
  );
}

function DhcpClientWindow({
  cur,
  dhcpClients,
  boundFn,
  badSet,
  onAdd,
  onEdit,
  onRemove,
}: {
  cur: string;
  dhcpClients: DhcpEntry[];
  boundFn: (r: string, d: DhcpEntry) => boolean;
  badSet: Set<any>;
  onAdd: () => void;
  onEdit: (item: DhcpEntry) => void;
  onRemove: (item: DhcpEntry) => void;
}) {
  const [selected, setSelected] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<string>('DHCP Client');

  return (
    <div>
      <div className="tabs">
        {['DHCP Client', 'DHCP Client Options'].map(tab => (
          <span
            key={tab}
            className={`tab ${activeTab === tab ? 'on' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="tl">
        <button className="ad tbtn" aria-label="Agregar" onClick={onAdd}>
          +
        </button>
        <button
          className="dl tbtn"
          aria-label="Quitar"
          onClick={() => {
            if (selected >= 0 && selected < dhcpClients.length) {
              onRemove(dhcpClients[selected]);
              setSelected(-1);
            }
          }}
        >
          −
        </button>
        <button className="tbtn" disabled>
          ✔
        </button>
        <button className="tbtn" disabled>
          ✖
        </button>
        <button className="tbtn" disabled>
          ▤
        </button>
        <button disabled>Release</button>
        <button disabled>Renew</button>
        <input type="text" className="fd" placeholder="Find" aria-label="Find" disabled />
      </div>
      <div className="ls">
        <table>
          <thead>
            <tr>
              <th>Interface</th>
              <th>Use P...</th>
              <th>Add D...</th>
              <th>IP Address</th>
              <th>Expires After</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {dhcpClients.map((x, k) => {
              const isBound = boundFn(cur, x);
              const isBad = badSet.has(x);
              return (
                <tr
                  key={k}
                  className={`${selected === k ? 's ' : ''}${isBad ? 'e' : ''}`}
                  onClick={() => setSelected(k)}
                  onDoubleClick={() => onEdit(x)}
                >
                  <td>{x.i}</td>
                  <td>yes</td>
                  <td>{x.def ? 'yes' : 'no'}</td>
                  <td>{isBound ? '203.0.113.20/24' : ''}</td>
                  <td>{isBound ? '00:09:47' : ''}</td>
                  <td>{isBound ? 'bound' : 'searching...'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="stb">{dhcpClients.length} item{dhcpClients.length === 1 ? '' : 's'}</div>
    </div>
  );
}

function DhcpDialog({
  v7,
  isEdit,
  item,
  boundState,
  onClose,
  onSave,
  onRemove,
}: {
  v7: boolean;
  isEdit: boolean;
  item?: DhcpEntry;
  boundState?: boolean;
  onClose: () => void;
  onSave: (iface: string, addDef: boolean) => string | null;
  onRemove?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [iface, setIface] = useState<string>(item?.i || 'ether1');
  const [addDef, setAddDef] = useState<string>(item?.def ? 'yes' : 'no');
  const [error, setError] = useState<string>('');

  const handleOk = () => {
    const err = onSave(iface, addDef === 'yes');
    if (err) setError(err);
  };

  return (
    <div>
      <div className="tabs">
        {['DHCP', 'Advanced', 'Status'].map((tab, idx) => (
          <span
            key={tab}
            className={`tab ${activeTab === idx ? 'on' : ''}`}
            onClick={() => setActiveTab(idx)}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="dlg">
        <div className="dl2">
          {activeTab === 0 && (
            <div className="fr">
              <label htmlFor="f-dh-if">Interface</label>
              <select
                id="f-dh-if"
                value={iface}
                onChange={e => setIface(e.target.value)}
              >
                {IFS.map(i => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
              <label>Use Peer DNS</label>
              <input type="checkbox" defaultChecked disabled />
              {v7 && (
                <>
                  <label>Use Peer NTP</label>
                  <input type="checkbox" defaultChecked disabled />
                </>
              )}
              <label htmlFor="f-dh-def">Add Default Route</label>
              <select
                id="f-dh-def"
                value={addDef}
                onChange={e => setAddDef(e.target.value)}
              >
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </div>
          )}
          {activeTab === 1 && (
            <div className="fr">
              <label>Default Route Distance</label>
              <input type="text" value="1" disabled />
            </div>
          )}
          {activeTab === 2 && (
            <div className="fr">
              <label>Status</label>
              <input type="text" value={boundState ? 'bound' : 'searching...'} disabled readOnly />
              <label>IP Address</label>
              <input type="text" value={boundState ? '203.0.113.20/24' : ''} disabled readOnly />
            </div>
          )}
          <div className="er" aria-live="polite">
            {error}
          </div>
        </div>
        <div className="bt">
          <button className="ok" onClick={handleOk}>
            OK
          </button>
          <button className="cn" onClick={onClose}>
            Cancel
          </button>
          <button disabled>Apply</button>
          <button disabled>Disable</button>
          <button disabled>Comment</button>
          <button disabled>Copy</button>
          {isEdit && onRemove ? (
            <button className="rm" onClick={onRemove}>
              Remove
            </button>
          ) : (
            <button disabled>Remove</button>
          )}
          <button disabled>Release</button>
          <button disabled>Renew</button>
        </div>
      </div>
      <div className="stb">
        <span>enabled · Status: {boundState ? 'bound' : 'searching...'}</span>
      </div>
    </div>
  );
}

function FirewallWindow({
  natRules,
  badSet,
  onAdd,
  onEdit,
  onRemove,
}: {
  natRules: NatEntry[];
  badSet: Set<any>;
  onAdd: () => void;
  onEdit: (item: NatEntry) => void;
  onRemove: (item: NatEntry) => void;
}) {
  const [selected, setSelected] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<string>('NAT');

  return (
    <div>
      <div className="tabs">
        {[
          'Filter Rules',
          'NAT',
          'Mangle',
          'Raw',
          'Service Ports',
          'Connections',
          'Address Lists',
          'Layer7 Protocols',
        ].map(tab => (
          <span
            key={tab}
            className={`tab ${activeTab === tab ? 'on' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="tl">
        <button className="ad tbtn" aria-label="Agregar" onClick={onAdd}>
          +
        </button>
        <button
          className="dl tbtn"
          aria-label="Quitar"
          onClick={() => {
            if (selected >= 0 && selected < natRules.length) {
              onRemove(natRules[selected]);
              setSelected(-1);
            }
          }}
        >
          −
        </button>
        <button className="tbtn" disabled>
          ✔
        </button>
        <button className="tbtn" disabled>
          ✖
        </button>
        <button className="tbtn" disabled>
          ▤
        </button>
        <button disabled>Reset Counters</button>
        <button disabled>Reset All Counters</button>
        <input type="text" className="fd" placeholder="Find" aria-label="Find" disabled />
      </div>
      <div className="ls">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Action</th>
              <th>Chain</th>
              <th>Src. Address</th>
              <th>Dst. Address</th>
              <th>Out. Inter...</th>
            </tr>
          </thead>
          <tbody>
            {natRules.map((x, k) => {
              const isBad = badSet.has(x);
              return (
                <tr
                  key={k}
                  className={`${selected === k ? 's ' : ''}${isBad ? 'e' : ''}`}
                  onClick={() => setSelected(k)}
                  onDoubleClick={() => onEdit(x)}
                >
                  <td>{k}</td>
                  <td>{x.action}</td>
                  <td>{x.chain}</td>
                  <td></td>
                  <td></td>
                  <td>{x.out}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="stb">{natRules.length} item{natRules.length === 1 ? '' : 's'}</div>
    </div>
  );
}

function NatDialog({
  isEdit,
  item,
  onClose,
  onSave,
  onRemove,
}: {
  isEdit: boolean;
  item?: NatEntry;
  onClose: () => void;
  onSave: (chain: string, outIface: string, action: string) => string | null;
  onRemove?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [chain, setChain] = useState<string>(item?.chain || 'srcnat');
  const [outIface, setOutIface] = useState<string>(item?.out || 'ether1');
  const [action, setAction] = useState<string>(item?.action || 'masquerade');
  const [error, setError] = useState<string>('');

  const handleOk = () => {
    const err = onSave(chain, outIface, action);
    if (err) setError(err);
  };

  return (
    <div>
      <div className="tabs">
        {['General', 'Advanced', 'Extra', 'Action', 'Statistics'].map((tab, idx) => (
          <span
            key={tab}
            className={`tab ${activeTab === idx ? 'on' : ''}`}
            onClick={() => setActiveTab(idx)}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="dlg">
        <div className="dl2">
          {activeTab === 0 && (
            <div className="fr">
              <label htmlFor="f-chain">Chain</label>
              <select
                id="f-chain"
                value={chain}
                onChange={e => setChain(e.target.value)}
              >
                <option value="srcnat">srcnat</option>
              </select>
              <label>Src. Address</label>
              <input type="text" disabled />
              <label>Dst. Address</label>
              <input type="text" disabled />
              <label>Protocol</label>
              <input type="text" disabled />
              <label htmlFor="f-out-if">Out. Interface</label>
              <select
                id="f-out-if"
                value={outIface}
                onChange={e => setOutIface(e.target.value)}
              >
                {IFS.map(i => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          )}
          {activeTab === 3 && (
            <div className="fr">
              <label htmlFor="f-act">Action</label>
              <select
                id="f-act"
                value={action}
                onChange={e => setAction(e.target.value)}
              >
                <option value="masquerade">masquerade</option>
              </select>
              <label>Log</label>
              <input type="checkbox" disabled />
              <label>Log Prefix</label>
              <input type="text" disabled />
            </div>
          )}
          {activeTab !== 0 && activeTab !== 3 && (
            <div className="fr">
              <label className="mu">Opciones avanzadas</label>
              <span className="mu">Predeterminadas para masquerade</span>
            </div>
          )}
          <div className="er" aria-live="polite">
            {error}
          </div>
        </div>
        <div className="bt">
          <button className="ok" onClick={handleOk}>
            OK
          </button>
          <button className="cn" onClick={onClose}>
            Cancel
          </button>
          <button disabled>Apply</button>
          <button disabled>Disable</button>
          <button disabled>Comment</button>
          <button disabled>Copy</button>
          {isEdit && onRemove ? (
            <button className="rm" onClick={onRemove}>
              Remove
            </button>
          ) : (
            <button disabled>Remove</button>
          )}
        </div>
      </div>
      <div className="stb">
        <span>enabled</span>
      </div>
    </div>
  );
}

function DnsDialog({
  dns,
  hasDhcpBound,
  onClose,
  onSave,
}: {
  dns: string;
  hasDhcpBound: boolean;
  onClose: () => void;
  onSave: (newDns: string) => void;
}) {
  const [servers, setServers] = useState<string>(dns);

  return (
    <div>
      <div className="dlg">
        <div className="dl2">
          <div className="fr">
            <label htmlFor="f-dns-s">Servers</label>
            <input
              type="text"
              id="f-dns-s"
              value={servers}
              onChange={e => setServers(e.target.value)}
              autoComplete="off"
            />
            <label>Dynamic Servers</label>
            <input
              type="text"
              value={hasDhcpBound ? '203.0.113.1' : ''}
              disabled
              readOnly
            />
            <label htmlFor="f-dns-rem">Allow Remote Requests</label>
            <input type="checkbox" id="f-dns-rem" defaultChecked={false} />
            <label>VRF</label>
            <input type="text" value="main" disabled readOnly />
            <label>Max UDP Packet Size</label>
            <input type="text" value="4096" disabled readOnly />
            <label>Query Server Timeout</label>
            <input type="text" value="2.000 s" disabled readOnly />
            <label>Query Total Timeout</label>
            <input type="text" value="10.000 s" disabled readOnly />
            <label>Cache Size</label>
            <input type="text" value="2048 KiB" disabled readOnly />
          </div>
        </div>
        <div className="bt">
          <button className="ok" onClick={() => onSave(servers.trim())}>
            OK
          </button>
          <button className="cn" onClick={onClose}>
            Cancel
          </button>
          <button disabled>Apply</button>
          <button disabled>Static</button>
          <button disabled>Cache</button>
        </div>
      </div>
    </div>
  );
}

function IdentityDialog({
  identity,
  onClose,
  onSave,
}: {
  identity: string;
  onClose: () => void;
  onSave: (name: string) => string | null;
}) {
  const [name, setName] = useState<string>(identity);
  const [error, setError] = useState<string>('');

  const handleOk = () => {
    const err = onSave(name);
    if (err) setError(err);
  };

  return (
    <div>
      <div className="dlg">
        <div className="dl2">
          <div className="fr">
            <label htmlFor="f-id">Identity</label>
            <input
              type="text"
              id="f-id"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="er" aria-live="polite">
            {error}
          </div>
        </div>
        <div className="bt">
          <button className="ok" onClick={handleOk}>
            OK
          </button>
          <button className="cn" onClick={onClose}>
            Cancel
          </button>
          <button disabled>Apply</button>
        </div>
      </div>
    </div>
  );
}

function ResetConfigDialog({
  onClose,
  onReset,
}: {
  onClose: () => void;
  onReset: (noDefault: boolean) => void;
}) {
  const [keepUser, setKeepUser] = useState<boolean>(true);
  const [noDefault, setNoDefault] = useState<boolean>(false);
  const [noBackup, setNoBackup] = useState<boolean>(false);

  return (
    <div className="dlg">
      <div className="dl2 ck">
        <label>
          <input
            type="checkbox"
            checked={keepUser}
            onChange={e => setKeepUser(e.target.checked)}
          />{' '}
          Keep User Configuration
        </label>
        <label>
          <input
            type="checkbox"
            checked={noDefault}
            onChange={e => setNoDefault(e.target.checked)}
          />{' '}
          No Default Configuration
        </label>
        <label>
          <input
            type="checkbox"
            checked={noBackup}
            onChange={e => setNoBackup(e.target.checked)}
          />{' '}
          Do Not Backup
        </label>
        <div className="fr">
          <label htmlFor="f-rr">Run After Reset:</label>
          <select id="f-rr">
            <option></option>
          </select>
        </div>
      </div>
      <div className="bt wide">
        <button className="ok" onClick={() => onReset(noDefault)}>
          Reset Configuration
        </button>
        <button className="cn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PingWindow({
  v7,
  onPing,
  onClose,
}: {
  v7: boolean;
  onPing: (target: string, count: number) => string[];
  onClose: () => void;
}) {
  const [target, setTarget] = useState<string>('1.1.1.1');
  const [count, setCount] = useState<string>('4');
  const [timeoutMs, setTimeoutMs] = useState<string>('1000');
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<string>('0 items');

  const startPing = () => {
    const c = +count || 4;
    const lines = onPing(target.trim(), c);
    setRows([]);
    setSummary('0 items');

    const tableRows: any[] = [];
    const rtts: number[] = [];
    let received = 0;

    lines.forEach((line, idx) => {
      setTimeout(() => {
        const m = line.match(/^\s*(\d+)\s+(\S+)\s+56\s+(\d+)\s+(\d+)ms/);
        const f = line.match(/^\s*(\d+)\s+(\S+)\s+(timeout|no route to host)/);
        if (m) {
          received++;
          rtts.push(+m[4]);
          tableRows.push({
            seq: m[1],
            host: m[2],
            time: `${m[4]} ms`,
            size: '50',
            ttl: m[3],
            status: '',
          });
        } else if (f) {
          tableRows.push({
            seq: f[1],
            host: f[2],
            time: '',
            size: '',
            ttl: '',
            status: f[3],
          });
        } else if (!/SEQ|sent=/.test(line)) {
          tableRows.push({
            span: line.replace('-> ', ''),
          });
        }
        setRows([...tableRows]);

        const totalPackets = Math.min(tableRows.length, c);
        const loss = totalPackets ? Math.round((100 * (totalPackets - received)) / totalPackets) : 0;
        const minT = rtts.length ? Math.min(...rtts) : 0;
        const avgT = rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : 0;
        const maxT = rtts.length ? Math.max(...rtts) : 0;

        setSummary(
          `${tableRows.length} items | ${received} of ${totalPackets} packets received | ${loss}% packet loss` +
            (rtts.length ? ` | Min: ${minT} ms | Avg: ${avgT} ms | Max: ${maxT} ms` : '')
        );
      }, idx * 220);
    });
  };

  return (
    <div>
      <div className="dlg">
        <div className="dl2">
          <div className="fr">
            <label htmlFor="pgt">Ping To:</label>
            <input
              type="text"
              id="pgt"
              value={target}
              onChange={e => setTarget(e.target.value)}
              autoComplete="off"
            />
            {v7 && (
              <>
                <label>VRF:</label>
                <select disabled></select>
              </>
            )}
            <label>Interface:</label>
            <select disabled></select>
            <label>ARP Ping</label>
            <input type="checkbox" disabled />
            <label htmlFor="pgc">Packet Count:</label>
            <input
              type="text"
              id="pgc"
              value={count}
              onChange={e => setCount(e.target.value)}
            />
            <label htmlFor="pgo">Timeout:</label>
            <input
              type="text"
              id="pgo"
              value={timeoutMs}
              onChange={e => setTimeoutMs(e.target.value)}
            />
          </div>
        </div>
        <div className="bt">
          <button className="go" onClick={startPing}>
            Start
          </button>
          <button className="sp" disabled>
            Stop
          </button>
          <button className="cl" onClick={onClose}>
            Close
          </button>
          <button disabled>New Window</button>
        </div>
      </div>
      <div className="ls pl">
        <table>
          <thead>
            <tr>
              <th>Seq #</th>
              <th>Host</th>
              <th>Time</th>
              <th>Reply Size</th>
              <th>TTL</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) =>
              row.span ? (
                <tr key={idx}>
                  <td colSpan={6}>{row.span}</td>
                </tr>
              ) : (
                <tr key={idx}>
                  <td>{row.seq}</td>
                  <td>{row.host}</td>
                  <td>{row.time}</td>
                  <td>{row.size}</td>
                  <td>{row.ttl}</td>
                  <td>{row.status}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      <div className="stb pst">
        <span>{summary}</span>
      </div>
    </div>
  );
}

function TerminalWindow({
  cur,
  identity,
  ver,
  autoRun,
  onExecute,
}: {
  cur: string;
  identity: string;
  ver: string;
  autoRun?: string;
  onExecute: (cmd: string) => string[];
}) {
  const [output, setOutput] = useState<string[]>([]);
  const [cmdInput, setCmdInput] = useState<string>('');
  const preRef = useRef<HTMLPreElement | null>(null);

  const getBanner = () => {
    const isV7 = ver[1] === '7';
    return [
      '',
      '  MMM      MMM       KKK                          TTTTTTTTTTT      KKK',
      '  MMMM    MMMM       KKK                          TTTTTTTTTTT      KKK',
      '  MMM MMMM MMM  III  KKK  KKK  RRRRRR     OOOOOO      TTT     III  KKK  KKK',
      '  MMM  MM  MMM  III  KKKKK     RRR  RRR  OOO  OOO     TTT     III  KKKKK',
      '  MMM      MMM  III  KKK KKK   RRRRRR    OOO  OOO     TTT     III  KKK KKK',
      '  MMM      MMM  III  KKK  KKK  RRR  RRR   OOOOOO      TTT     III  KKK  KKK',
      '',
      `  MikroTik RouterOS ${ver.slice(1)} (c) 1999-${isV7 ? '2024' : '2025'}       http${isV7 ? 's' : ''}://www.mikrotik.com/`,
      '',
      isV7
        ? 'Press F1 for help'
        : '[?]             Gives the list of available commands\ncommand [?]     Gives help on the command and list of arguments\n\n[Tab]           Completes the command/word. If the input is ambiguous,\n                a second [Tab] gives possible options\n\n/               Move up to base level\n..              Move up one level\n/command        Use command at the base level',
      '',
      '',
    ].join('\n');
  };

  useEffect(() => {
    setOutput([getBanner()]);
    if (autoRun) {
      setTimeout(() => {
        runScript(autoRun);
      }, 50);
    }
  }, []);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [output]);

  const runScript = (text: string) => {
    const lines = text.split('\n');
    const newOut: string[] = [];
    lines.forEach(line => {
      if (!line.trim()) return;
      newOut.push(`[admin@${identity}] > ${line}`);
      const res = onExecute(line);
      if (res && res.length) {
        newOut.push(...res);
      }
    });
    setOutput(prev => [...prev, ...newOut]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = cmdInput;
      setCmdInput('');
      runScript(val);
    }
  };

  return (
    <div>
      <pre className="o" ref={preRef}>
        {output.map((block, idx) => (
          <span key={idx}>
            {formatTerminalLine(block)}
            {'\n'}
          </span>
        ))}
      </pre>
      <div className="pr">
        <span className="pm">
          <span className="p1">[</span>
          <span className="pa">admin</span>
          <span className="p1">@</span>
          <span className="pn">{identity}</span>
          <span className="p1">] &gt; </span>
        </span>
        <textarea
          rows={2}
          spellCheck={false}
          aria-label="Terminal"
          value={cmdInput}
          onChange={e => setCmdInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}

function formatTerminalLine(line: string) {
  if (line.startsWith('[admin@')) {
    const promptEnd = line.indexOf('] > ');
    if (promptEnd !== -1) {
      const prompt = line.slice(0, promptEnd + 4);
      const command = line.slice(promptEnd + 4);
      return (
        <>
          <span className="pa">{prompt}</span>
          <span className="cp">{command}</span>
        </>
      );
    }
  }
  if (/^\s+(sent=|max-rtt)/.test(line)) {
    return <span className="og">{line}</span>;
  }
  if (/^\s*(SEQ|#)\s|^Flags:/.test(line)) {
    return <b>{line}</b>;
  }
  return line;
}

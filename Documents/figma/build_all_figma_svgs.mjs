import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(__dirname, 'desktop');
const mobileDir = path.join(__dirname, 'mobile');
const masterDir = path.join(__dirname, 'master');

const wfDir = path.join(__dirname, 'wireframe');
const wfDesktopDir = path.join(wfDir, 'desktop');
const wfMobileDir = path.join(wfDir, 'mobile');
const wfMasterDir = path.join(wfDir, 'master');

fs.mkdirSync(desktopDir, { recursive: true });
fs.mkdirSync(mobileDir, { recursive: true });
fs.mkdirSync(masterDir, { recursive: true });
fs.mkdirSync(wfDesktopDir, { recursive: true });
fs.mkdirSync(wfMobileDir, { recursive: true });
fs.mkdirSync(wfMasterDir, { recursive: true });

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function svgHeader(w, h, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background:#0F172A;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.25"/>
    </filter>
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F766E"/>
      <stop offset="100%" stop-color="#14B8A6"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
  </defs>
  <!-- Frame: ${String(title).replace(/&amp;/g, '&')} -->
`;
}

function svgFooter() {
  return `</svg>`;
}

// ---------------------------------------------------------------------------
// DESKTOP COMMON SHELL (1440 x 900)
// ---------------------------------------------------------------------------
function desktopChrome(activeNav = 'DSK-01', screenTitle = 'Tổng quan') {
  const navItems = [
    { id: 'DSK-01', label: '1. Tổng quan Dashboard', icon: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z' },
    { id: 'DSK-02', label: '2. Đề xuất FEFO &amp; Món', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
    { id: 'DSK-03', label: '3. Kho thực phẩm', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { id: 'DSK-04', label: '4. Trung tâm cảnh báo', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
    { id: 'DSK-05', label: '5. Nhật ký kiểm toán', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { id: 'DSK-06', label: '6. Quản lý danh mục', icon: 'M4 6h16M4 12h16M4 18h16' },
    { id: 'DSK-07', label: '7. Cấu hình máy chủ', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  ];

  let navMarkup = '';
  let y = 110;
  for (const item of navItems) {
    const isActive = item.id === activeNav;
    const bg = isActive ? '#0F766E' : 'transparent';
    const textCol = isActive ? '#FFFFFF' : '#94A3B8';
    const fontW = isActive ? '600' : '400';
    navMarkup += `
      <g id="Nav_${item.id}" cursor="pointer">
        <rect x="16" y="${y}" width="228" height="42" rx="8" fill="${bg}" />
        <path d="${item.icon}" fill="none" stroke="${textCol}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(32, ${y + 12}) scale(0.75)" />
        <text x="64" y="${y + 26}" fill="${textCol}" font-size="14" font-weight="${fontW}">${item.label}</text>
      </g>
    `;
    y += 50;
  }

  return `
    <!-- Top OS Window Bar -->
    <rect x="0" y="0" width="1440" height="44" fill="#090D16" />
    <circle cx="24" cy="22" r="6" fill="#EF4444" />
    <circle cx="42" cy="22" r="6" fill="#F59E0B" />
    <circle cx="60" cy="22" r="6" fill="#10B981" />
    <text x="84" y="27" fill="#64748B" font-size="13" font-weight="500">QUẢN LÝ THỰC PHẨM GIA ĐÌNH &amp; ĐỀ XUẤT FEFO — SERVER WORKBENCH (Desktop App)</text>
    <rect x="1245" y="10" width="175" height="24" rx="12" fill="#1E293B" />
    <circle cx="1260" cy="22" r="4" fill="#10B981" />
    <text x="1273" y="26" fill="#10B981" font-size="12" font-weight="600">TCP Port 8080 • Online</text>

    <!-- Top App Navigation Bar -->
    <rect x="0" y="44" width="1440" height="52" fill="#0F172A" />
    <line x1="0" y1="96" x2="1440" y2="96" stroke="#1E293B" stroke-width="1" />
    <rect x="24" y="56" width="30" height="28" rx="6" fill="url(#primaryGrad)" />
    <text x="32" y="76" fill="#FFF" font-size="16" font-weight="700">QP</text>
    <text x="64" y="75" fill="#F8FAFC" font-size="17" font-weight="700">FoodManagement<tspan fill="#14B8A6">Server</tspan></text>
    
    <!-- Time Simulator Controls in Header -->
    <g id="Time_Simulator_Bar" transform="translate(680, 54)">
      <rect x="0" y="0" width="460" height="34" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="14" y="22" fill="#94A3B8" font-size="12">Thời gian giả lập:</text>
      <text x="120" y="22" fill="#38BDF8" font-size="13" font-weight="700">15/11/2026</text>
      <rect x="210" y="4" width="45" height="26" rx="4" fill="#334155" />
      <text x="222" y="21" fill="#FFF" font-size="12">-1d</text>
      <rect x="262" y="4" width="45" height="26" rx="4" fill="#0F766E" />
      <text x="273" y="21" fill="#FFF" font-size="12">+1d</text>
      <rect x="314" y="4" width="45" height="26" rx="4" fill="#0F766E" />
      <text x="325" y="21" fill="#FFF" font-size="12">+3d</text>
      <rect x="366" y="4" width="45" height="26" rx="4" fill="#0F766E" />
      <text x="377" y="21" fill="#FFF" font-size="12">+7d</text>
      <rect x="418" y="4" width="34" height="26" rx="4" fill="#475569" />
      <text x="424" y="21" fill="#FFF" font-size="11">Reset</text>
    </g>

    <!-- Client Status Indicator -->
    <rect x="1160" y="56" width="256" height="30" rx="6" fill="#1E293B" />
    <circle cx="1176" cy="71" r="5" fill="#38BDF8" />
    <text x="1190" y="75" fill="#E2E8F0" font-size="12">Client kết nối: <tspan fill="#38BDF8" font-weight="700">2 Mobile</tspan> (192.168.1.5)</text>

    <!-- Left Sidebar -->
    <rect x="0" y="96" width="260" height="804" fill="#0B132B" />
    <line x1="260" y1="96" x2="260" y2="900" stroke="#1E293B" stroke-width="1" />
    <text x="24" y="130" fill="#475569" font-size="11" font-weight="700" letter-spacing="1">PHÂN HỆ NGHIỆP VỤ</text>
    ${navMarkup}

    <!-- Sidebar Bottom System Tray Status -->
    <g transform="translate(16, 790)">
      <rect x="0" y="0" width="228" height="80" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <circle cx="20" cy="24" r="6" fill="#10B981" />
      <text x="36" y="28" fill="#E2E8F0" font-size="13" font-weight="600">Dịch vụ nền Desktop</text>
      <text x="36" y="48" fill="#94A3B8" font-size="11">HTTP/1.1 + REST JSON + SSE</text>
      <text x="36" y="66" fill="#38BDF8" font-size="11">TCP :8080 • /api/events</text>
    </g>

    <!-- Content Area Background -->
    <rect x="260" y="96" width="1180" height="804" fill="#0F172A" />
  `;
}

// ---------------------------------------------------------------------------
// 1. DSK-01: Dashboard
// ---------------------------------------------------------------------------
function renderDSK01() {
  return `${svgHeader(1440, 900, 'DSK-01: Dashboard Server')}
  ${desktopChrome('DSK-01', 'Tổng quan')}
  <g id="Content_DSK-01" transform="translate(284, 116)">
    <!-- Header -->
    <text x="0" y="24" fill="#F8FAFC" font-size="22" font-weight="700">Bảng Điều Khiển Tổng Quan (Server Dashboard)</text>
    <text x="0" y="48" fill="#94A3B8" font-size="13">Hệ thống gợi ý FEFO &amp; giám sát luồng hàng hóa thời gian thực</text>
    <!-- 4-Level Color-Coded Lifecycle Legend -->
    <g transform="translate(650, 26)">
      <rect x="0" y="0" width="102" height="24" rx="12" fill="#064E3B" stroke="#10B981" stroke-width="1" /><text x="51" y="16" text-anchor="middle" fill="#6EE7B7" font-size="11" font-weight="700">● An toàn (&gt;3d)</text>
      <rect x="110" y="0" width="122" height="24" rx="12" fill="#78350F" stroke="#F59E0B" stroke-width="1" /><text x="171" y="16" text-anchor="middle" fill="#FCD34D" font-size="11" font-weight="700">⏳ Cận hạn (1-3d)</text>
      <rect x="240" y="0" width="122" height="24" rx="12" fill="#7F1D1D" stroke="#EF4444" stroke-width="1" /><text x="301" y="16" text-anchor="middle" fill="#FCA5A5" font-size="11" font-weight="700">! Hết hạn • Hủy</text>
      <rect x="370" y="0" width="110" height="24" rx="12" fill="#312E81" stroke="#818CF8" stroke-width="1" /><text x="425" y="16" text-anchor="middle" fill="#E0E7FF" font-size="11" font-weight="700">◆ Cạn kho (≤min)</text>
    </g>

    <!-- 4 KPI Cards -->
    <g id="KPI_Row" transform="translate(0, 70)">
      <rect x="0" y="0" width="265" height="100" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" filter="url(#shadow)" />
      <text x="20" y="30" fill="#94A3B8" font-size="13">Tổng mặt hàng trong kho</text>
      <text x="20" y="68" fill="#F8FAFC" font-size="32" font-weight="700">15</text>
      <rect x="180" y="20" width="65" height="24" rx="12" fill="#064E3B" />
      <text x="194" y="36" fill="#6EE7B7" font-size="11" font-weight="600">16 Lô tồn</text>
      <text x="20" y="88" fill="#10B981" font-size="11">An toàn (&gt; 3 ngày): 11 lô</text>

      <rect x="285" y="0" width="265" height="100" rx="10" fill="#1E293B" stroke="#F59E0B" stroke-width="1" filter="url(#shadow)" />
      <text x="305" y="30" fill="#94A3B8" font-size="13">Cận hạn FEFO Cấp 1</text>
      <text x="305" y="68" fill="#F59E0B" font-size="32" font-weight="700">3</text>
      <rect x="455" y="20" width="78" height="24" rx="12" fill="#78350F" />
      <text x="464" y="36" fill="#FCD34D" font-size="11" font-weight="600">⏳ 1–3 Ngày</text>
      <text x="305" y="88" fill="#FCD34D" font-size="11">⏳ Ưu tiên chế biến ngay</text>

      <rect x="570" y="0" width="265" height="100" rx="10" fill="#1E293B" stroke="#EF4444" stroke-width="1" filter="url(#shadow)" />
      <text x="590" y="30" fill="#94A3B8" font-size="13">Nguy cấp / Hết hạn</text>
      <text x="590" y="68" fill="#EF4444" font-size="32" font-weight="700">2</text>
      <rect x="745" y="20" width="72" height="24" rx="12" fill="#7F1D1D" />
      <text x="755" y="36" fill="#FCA5A5" font-size="11" font-weight="600">! Tiêu hủy</text>
      <text x="590" y="88" fill="#F87171" font-size="11">Quá hạn / hết hôm nay — hủy bỏ</text>

      <rect x="855" y="0" width="275" height="100" rx="10" fill="#1E293B" stroke="#818CF8" stroke-width="1" filter="url(#shadow)" />
      <text x="875" y="30" fill="#94A3B8" font-size="13">Cạn kho (≤ min_threshold)</text>
      <text x="875" y="68" fill="#A5B4FC" font-size="32" font-weight="700">4</text>
      <rect x="1030" y="20" width="84" height="24" rx="12" fill="#312E81" />
      <text x="1042" y="36" fill="#E0E7FF" font-size="11" font-weight="600">◆ Cạn kho</text>
      <text x="875" y="88" fill="#A5B4FC" font-size="11">Cần mua thêm bổ sung</text>
    </g>

    <!-- Charts & FEFO Table Row -->
    <g id="Charts_Row" transform="translate(0, 190)">
      <rect x="0" y="0" width="680" height="320" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="24" y="34" fill="#F8FAFC" font-size="16" font-weight="700">Danh Sách Thực Phẩm FEFO Ưu Tiên Dùng Trước</text>
      <text x="24" y="54" fill="#94A3B8" font-size="12">Chuẩn 4 màu vòng đời: An toàn · ⏳ Cận hạn (1-3d) · Hết hạn (≤0d) · Cạn kho</text>
      
      <rect x="20" y="70" width="640" height="34" rx="6" fill="#334155" />
      <text x="36" y="92" fill="#CBD5E1" font-size="12" font-weight="600">item_id</text>
      <text x="120" y="92" fill="#CBD5E1" font-size="12" font-weight="600">food_name</text>
      <text x="270" y="92" fill="#CBD5E1" font-size="12" font-weight="600">current_qty</text>
      <text x="385" y="92" fill="#CBD5E1" font-size="12" font-weight="600">expiration_date</text>
      <text x="510" y="92" fill="#CBD5E1" font-size="12" font-weight="600">TRẠNG THÁI 4 CẤP</text>
      
      <!-- Row 1: Expired (Đỏ rực) -->
      <rect x="20" y="110" width="640" height="44" rx="4" fill="#0F172A" />
      <text x="36" y="136" fill="#38BDF8" font-size="13" font-weight="600">#0 (TP000)</text>
      <text x="120" y="136" fill="#FFF" font-size="13" font-weight="600">Sữa chua không đường</text>
      <text x="270" y="136" fill="#94A3B8" font-size="13">2 hộp (200 g)</text>
      <text x="385" y="136" fill="#F87171" font-size="13">15/11/2026 (0d)</text>
      <rect x="510" y="122" width="132" height="22" rx="4" fill="#7F1D1D" />
      <text x="520" y="137" fill="#FCA5A5" font-size="11" font-weight="700">HẾT HẠN • TIÊU HỦY</text>

      <!-- Row 2: Cận hạn 1-3d (Vàng cam + ⏳) -->
      <rect x="20" y="160" width="640" height="44" rx="4" fill="#1E293B" />
      <text x="36" y="186" fill="#38BDF8" font-size="13" font-weight="600">#1 (TP001)</text>
      <text x="120" y="186" fill="#FFF" font-size="13" font-weight="600">Sữa tươi thanh trùng</text>
      <text x="270" y="186" fill="#94A3B8" font-size="13">2 hộp (900 ml)</text>
      <text x="385" y="186" fill="#FBBF24" font-size="13">16/11/2026 (Còn 1d)</text>
      <rect x="510" y="172" width="122" height="22" rx="4" fill="#78350F" />
      <text x="520" y="187" fill="#FCD34D" font-size="11" font-weight="700">⏳ CẬN HẠN (1d)</text>

      <!-- Row 3: Cận hạn 1-3d (Vàng cam + ⏳) -->
      <rect x="20" y="210" width="640" height="44" rx="4" fill="#0F172A" />
      <text x="36" y="236" fill="#38BDF8" font-size="13" font-weight="600">#3 (TP003)</text>
      <text x="120" y="236" fill="#FFF" font-size="13" font-weight="600">Thịt bò phi lê</text>
      <text x="270" y="236" fill="#94A3B8" font-size="13">500 g</text>
      <text x="385" y="236" fill="#FBBF24" font-size="13">17/11/2026 (Còn 2d)</text>
      <rect x="510" y="222" width="122" height="22" rx="4" fill="#78350F" />
      <text x="520" y="237" fill="#FCD34D" font-size="11" font-weight="700">⏳ CẬN HẠN (2d)</text>

      <!-- Row 4: An toàn > 3d + Cạn kho indicator -->
      <rect x="20" y="260" width="640" height="44" rx="4" fill="#1E293B" />
      <text x="36" y="286" fill="#38BDF8" font-size="13" font-weight="600">#8 (TP008)</text>
      <text x="120" y="286" fill="#FFF" font-size="13" font-weight="600">Trứng gà ta</text>
      <text x="270" y="286" fill="#A5B4FC" font-size="13">4 quả (≤ min)</text>
      <text x="385" y="286" fill="#34D399" font-size="13">22/11/2026 (Còn 7d)</text>
      <rect x="510" y="272" width="66" height="22" rx="4" fill="#064E3B" />
      <text x="518" y="287" fill="#6EE7B7" font-size="11" font-weight="700">AN TOÀN</text>
      <rect x="582" y="272" width="68" height="22" rx="4" fill="#312E81" />
      <text x="590" y="287" fill="#E0E7FF" font-size="11" font-weight="700">CẠN KHO</text>

      <!-- Right: Category Distribution Chart (Width: 430) -->
      <g transform="translate(700, 0)">
        <rect x="0" y="0" width="430" height="320" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
        <text x="24" y="34" fill="#F8FAFC" font-size="16" font-weight="700">Phân Bổ Tồn Kho Theo Nhóm</text>
        <text x="24" y="54" fill="#94A3B8" font-size="12">7 Nhóm thực phẩm chính trong CSDL</text>

        <g transform="translate(120, 180)">
          <circle cx="0" cy="0" r="70" fill="none" stroke="#0F766E" stroke-width="26" stroke-dasharray="140 300" />
          <circle cx="0" cy="0" r="70" fill="none" stroke="#F59E0B" stroke-width="26" stroke-dasharray="80 300" stroke-dashoffset="-145" />
          <circle cx="0" cy="0" r="70" fill="none" stroke="#3B82F6" stroke-width="26" stroke-dasharray="60 300" stroke-dashoffset="-230" />
          <circle cx="0" cy="0" r="70" fill="none" stroke="#10B981" stroke-width="26" stroke-dasharray="70 300" stroke-dashoffset="-295" />
          <text x="0" y="6" text-anchor="middle" fill="#FFF" font-size="18" font-weight="700">16 Lô</text>
        </g>

        <g transform="translate(230, 90)">
          <circle cx="8" cy="12" r="5" fill="#0F766E" /><text x="24" y="16" fill="#CBD5E1" font-size="12">Thịt &amp; Hải sản (32%)</text>
          <circle cx="8" cy="42" r="5" fill="#F59E0B" /><text x="24" y="46" fill="#CBD5E1" font-size="12">Rau củ quả (24%)</text>
          <circle cx="8" cy="72" r="5" fill="#3B82F6" /><text x="24" y="76" fill="#CBD5E1" font-size="12">Sữa &amp; Chế phẩm (18%)</text>
          <circle cx="8" cy="102" r="5" fill="#10B981" /><text x="24" y="106" fill="#CBD5E1" font-size="12">Gia vị &amp; Đồ khô (26%)</text>
        </g>
      </g>
    </g>

    <!-- Bottom Action Row: Quick Navigation & Audit Feed -->
    <g id="Bottom_Row" transform="translate(0, 530)">
      <rect x="0" y="0" width="1130" height="150" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="24" y="30" fill="#F8FAFC" font-size="15" font-weight="700">Nhật Ký Tương Tác Client–Server Trực Tiếp</text>
      <text x="24" y="50" fill="#94A3B8" font-size="12">HTTP/1.1 + REST JSON + SSE (/api/events)</text>

      <g transform="translate(24, 65)">
        <circle cx="6" cy="12" r="4" fill="#10B981" />
        <text x="20" y="16" fill="#94A3B8" font-size="12">[22:30:15] <tspan fill="#38BDF8">Mobile_Client_1 (192.168.1.5)</tspan>: Gửi <tspan fill="#FFF">POST /api/food/use (Trừ 200g Thịt bò phi lê)</tspan> -&gt; 200 OK (TXN-015)</text>
      </g>
      <g transform="translate(24, 95)">
        <circle cx="6" cy="12" r="4" fill="#38BDF8" />
        <text x="20" y="16" fill="#94A3B8" font-size="12">[22:32:00] <tspan fill="#38BDF8">Desktop_Server</tspan>: Kích hoạt <tspan fill="#F59E0B">POST /api/simulation/date (+3 ngày)</tspan> -&gt; Phát SSE cập nhật 3 cảnh báo</text>
      </g>
      <g transform="translate(24, 125)">
        <circle cx="6" cy="12" r="4" fill="#10B981" />
        <text x="20" y="16" fill="#94A3B8" font-size="12">[22:35:40] <tspan fill="#38BDF8">Mobile_Client_2 (192.168.1.8)</tspan>: Kết nối IP/LAN :8080 (GET /api/status + SSE /api/events) -&gt; Đã đồng bộ</text>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// 2. DSK-02: FEFO Recommendations & Recipes
// ---------------------------------------------------------------------------
function renderDSK02() {
  return `${svgHeader(1440, 900, 'DSK-02: FEFO &amp; Recipes')}
  ${desktopChrome('DSK-02', 'Đề xuất FEFO &amp; Món ăn')}
  <g id="Content_DSK-02" transform="translate(284, 116)">
    <text x="0" y="24" fill="#F8FAFC" font-size="22" font-weight="700">Đề Xuất Chế Biến Theo Thuật Toán FEFO &amp; Gợi Ý Món Ăn</text>
    <text x="0" y="48" fill="#94A3B8" font-size="13">Tự động đối sánh kho thực phẩm với 7 công thức nấu ăn gia đình</text>

    <!-- Left: FEFO Queue List (Width: 540) -->
    <g transform="translate(0, 70)">
      <rect x="0" y="0" width="530" height="610" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="20" y="32" fill="#F8FAFC" font-size="16" font-weight="700">Hàng Đợi FEFO 3 Cấp (Ưu Tiên Tiêu Thụ)</text>
      <text x="20" y="52" fill="#94A3B8" font-size="12">expiration_date ASC → import_date (FIFO) → lô dở dang tồn ít</text>

      <!-- FEFO Item 1 (Vàng cam + ⏳ cho Cận hạn 1-3 ngày) -->
      <g transform="translate(16, 70)">
        <rect x="0" y="0" width="498" height="85" rx="8" fill="#0F172A" stroke="#F59E0B" stroke-width="1.5" />
        <rect x="12" y="12" width="60" height="60" rx="6" fill="#78350F" />
        <text x="28" y="48" fill="#FFF" font-size="20">🥩</text>
        <text x="84" y="32" fill="#FFF" font-size="15" font-weight="700">Thịt bò phi lê (item_id: #3)</text>
        <text x="84" y="52" fill="#94A3B8" font-size="12">Tồn: 500 g • Lô dở dang tồn ít • Ngăn mát</text>
        <text x="84" y="70" fill="#FBBF24" font-size="12" font-weight="600">⏳ expiration_date: 17/11/2026 (Còn 2 ngày)</text>
        <rect x="382" y="28" width="102" height="30" rx="6" fill="#78350F" stroke="#F59E0B" />
        <text x="392" y="48" fill="#FCD34D" font-size="11" font-weight="700">⏳ FEFO #1</text>
      </g>

      <!-- FEFO Item 2 (Vàng cam + ⏳ cho Cận hạn 1-3 ngày) -->
      <g transform="translate(16, 170)">
        <rect x="0" y="0" width="498" height="85" rx="8" fill="#0F172A" stroke="#F59E0B" stroke-width="1" />
        <rect x="12" y="12" width="60" height="60" rx="6" fill="#78350F" />
        <text x="28" y="48" fill="#FFF" font-size="20">🥬</text>
        <text x="84" y="32" fill="#FFF" font-size="15" font-weight="700">Rau cải thìa (LOT-004)</text>
        <text x="84" y="52" fill="#94A3B8" font-size="12">Tồn: 300 g • Hộc rau củ</text>
        <text x="84" y="70" fill="#FBBF24" font-size="12" font-weight="600">⏳ Hết hạn: 18/11/2026 (Còn 3 ngày)</text>
        <rect x="382" y="28" width="102" height="30" rx="6" fill="#78350F" stroke="#F59E0B" />
        <text x="392" y="48" fill="#FCD34D" font-size="11" font-weight="700">⏳ FEFO #2</text>
      </g>

      <!-- FEFO Item 3 (Xanh lục > 3 ngày) -->
      <g transform="translate(16, 270)">
        <rect x="0" y="0" width="498" height="85" rx="8" fill="#0F172A" stroke="#10B981" stroke-width="1" />
        <rect x="12" y="12" width="60" height="60" rx="6" fill="#064E3B" />
        <text x="28" y="48" fill="#FFF" font-size="20">🍅</text>
        <text x="84" y="32" fill="#FFF" font-size="15" font-weight="700">Cà chua chín (LOT-007)</text>
        <text x="84" y="52" fill="#94A3B8" font-size="12">Tồn: 4 quả (400 g) • Ngăn mát</text>
        <text x="84" y="70" fill="#34D399" font-size="12">An toàn: 20/11/2026 (Còn 5 ngày)</text>
        <rect x="382" y="28" width="102" height="30" rx="6" fill="#064E3B" />
        <text x="396" y="48" fill="#6EE7B7" font-size="11" font-weight="600">An toàn #3</text>
      </g>
    </g>

    <!-- Right: Matched Recipes Suggestions (Width: 580) -->
    <g transform="translate(550, 70)">
      <rect x="0" y="0" width="580" height="610" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="24" y="32" fill="#F8FAFC" font-size="16" font-weight="700">Công Thức Nấu Ăn (Match Score +30% Cận Hạn)</text>
      <text x="24" y="52" fill="#94A3B8" font-size="12">GET /api/recipes/suggest • Cộng +30% điểm nguyên liệu cận hạn, bỏ qua gia vị cơ bản</text>

      <!-- Recipe Card 1 -->
      <g transform="translate(20, 70)">
        <rect x="0" y="0" width="540" height="155" rx="8" fill="#0F172A" stroke="#0F766E" stroke-width="1.5" />
        <text x="20" y="30" fill="#38BDF8" font-size="16" font-weight="700">MÓN 1: BÒ XÀO RAU CẢI THÌA</text>
        <rect x="355" y="14" width="170" height="26" rx="13" fill="#064E3B" />
        <text x="440" y="31" text-anchor="middle" fill="#6EE7B7" font-size="11" font-weight="700">Match 100% (+30% cận hạn)</text>

        <text x="20" y="58" fill="#E2E8F0" font-size="13">Giải quyết được: <tspan fill="#FCD34D" font-weight="700">⏳ Thịt bò (2d)</tspan> + <tspan fill="#FCD34D" font-weight="700">⏳ Cải thìa (3d)</tspan></text>
        <text x="20" y="80" fill="#94A3B8" font-size="12">Nguyên liệu chính: 300g Thịt bò, 250g Cải thìa (Bỏ qua gia vị cơ bản: Tỏi, Dầu)</text>

        <g cursor="pointer" transform="translate(20, 100)">
          <rect x="0" y="0" width="160" height="36" rx="6" fill="#0F766E" />
          <text x="24" y="23" fill="#FFF" font-size="13" font-weight="600">Nấu món này (Trừ kho)</text>
        </g>
        <g cursor="pointer" transform="translate(190, 100)">
          <rect x="0" y="0" width="130" height="36" rx="6" fill="#1E293B" stroke="#475569" stroke-width="1" />
          <text x="20" y="23" fill="#CBD5E1" font-size="13">Xem công thức</text>
        </g>
      </g>

      <!-- Recipe Card 2 -->
      <g transform="translate(20, 245)">
        <rect x="0" y="0" width="540" height="155" rx="8" fill="#0F172A" stroke="#334155" stroke-width="1" />
        <text x="20" y="30" fill="#F8FAFC" font-size="16" font-weight="700">MÓN 2: CANH CHUA CÁ LÓC NAM BỘ</text>
        <rect x="355" y="14" width="170" height="26" rx="13" fill="#78350F" />
        <text x="440" y="31" text-anchor="middle" fill="#FCD34D" font-size="11" font-weight="700">Match 80% (trừ gia vị)</text>

        <text x="20" y="58" fill="#E2E8F0" font-size="13">Giải quyết được: <tspan fill="#FBBF24" font-weight="700">Cà chua (5d)</tspan> + Cá lóc tươi</text>
        <text x="20" y="80" fill="#94A3B8" font-size="12">Còn thiếu: Bạc hà (Dọc mùng), Giá đỗ (Cần mua thêm)</text>

        <g cursor="pointer" transform="translate(20, 100)">
          <rect x="0" y="0" width="180" height="36" rx="6" fill="#1E293B" stroke="#38BDF8" stroke-width="1" />
          <text x="16" y="23" fill="#38BDF8" font-size="13">+ Thêm nguyên liệu thiếu</text>
        </g>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// 3. DSK-03: Inventory Management & Search Filter
// ---------------------------------------------------------------------------
function renderDSK03() {
  return `${svgHeader(1440, 900, 'DSK-03: Inventory &amp; Drawer')}
  ${desktopChrome('DSK-03', 'Kho thực phẩm')}
  <g id="Content_DSK-03" transform="translate(284, 116)">
    <text x="0" y="24" fill="#F8FAFC" font-size="22" font-weight="700">Quản Lý Kho Thực Phẩm &amp; Lô Hàng</text>
    <text x="0" y="48" fill="#94A3B8" font-size="13">Tìm kiếm, lọc 5 tiêu chuẩn và thao tác trực tiếp trên từng lô hàng</text>

    <!-- Filter Bar -->
    <g transform="translate(0, 65)">
      <rect x="0" y="0" width="280" height="38" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="36" y="24" fill="#94A3B8" font-size="13">🔍 Tìm tên, mã lô...</text>

      <rect x="295" y="0" width="170" height="38" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="310" y="24" fill="#E2E8F0" font-size="13">Nhóm: Tất cả (7)</text>

      <rect x="480" y="0" width="170" height="38" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="495" y="24" fill="#E2E8F0" font-size="13">Vị trí: Tủ lạnh (8)</text>

      <rect x="665" y="0" width="150" height="38" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="680" y="24" fill="#E2E8F0" font-size="13">Đang sử dụng</text>

      <g transform="translate(815, 0)">
        <rect x="0" y="0" width="135" height="38" rx="6" fill="#0F766E" />
        <text x="14" y="24" fill="#FFF" font-size="13" font-weight="600">+ Nhập thực phẩm</text>

        <rect x="145" y="0" width="170" height="38" rx="6" fill="#1E293B" stroke="#64748B" stroke-width="1" stroke-dasharray="4 3" />
        <text x="155" y="24" fill="#94A3B8" font-size="11">📷 AI Scan [Future Scope]</text>
      </g>
    </g>

    <!-- Main Data Table (Width: 720) -->
    <g transform="translate(0, 120)">
      <rect x="0" y="0" width="720" height="560" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
      
      <rect x="16" y="16" width="688" height="36" rx="6" fill="#334155" />
      <text x="30" y="39" fill="#CBD5E1" font-size="12" font-weight="600">item_id</text>
      <text x="110" y="39" fill="#CBD5E1" font-size="12" font-weight="600">food_name</text>
      <text x="250" y="39" fill="#CBD5E1" font-size="12" font-weight="600">current_qty</text>
      <text x="360" y="39" fill="#CBD5E1" font-size="12" font-weight="600">expiration_date</text>
      <text x="470" y="39" fill="#CBD5E1" font-size="12" font-weight="600">location</text>
      <text x="590" y="39" fill="#CBD5E1" font-size="12" font-weight="600">THAO TÁC</text>

      <!-- Row 1 Selected (Cận hạn 1d: Vàng cam + ⏳) -->
      <rect x="16" y="60" width="688" height="46" rx="4" fill="#0F766E" opacity="0.25" stroke="#0F766E" stroke-width="1" />
      <text x="30" y="88" fill="#38BDF8" font-size="13" font-weight="700">#1 (TP001)</text>
      <text x="110" y="88" fill="#FFF" font-size="13" font-weight="600">Sữa tươi thanh trùng</text>
      <text x="250" y="88" fill="#E2E8F0" font-size="13">2 hộp (900 ml)</text>
      <text x="360" y="88" fill="#FBBF24" font-size="13">⏳ 16/11 (1d)</text>
      <text x="470" y="88" fill="#94A3B8" font-size="13">Cánh tủ lạnh</text>
      <rect x="590" y="72" width="55" height="24" rx="4" fill="#0F766E" />
      <text x="602" y="88" fill="#FFF" font-size="11">Chi tiết</text>

      <!-- Row 2 (An toàn >3d: Xanh lục) -->
      <rect x="16" y="112" width="688" height="46" rx="4" fill="#0F172A" />
      <text x="30" y="140" fill="#38BDF8" font-size="13" font-weight="700">#2 (TP002)</text>
      <text x="110" y="140" fill="#FFF" font-size="13" font-weight="600">Sữa chua Vinamilk</text>
      <text x="250" y="140" fill="#E2E8F0" font-size="13">4 hộp (100g)</text>
      <text x="360" y="140" fill="#34D399" font-size="13">28/11 (13d)</text>
      <text x="470" y="140" fill="#94A3B8" font-size="13">Ngăn mát</text>
      <rect x="590" y="124" width="55" height="24" rx="4" fill="#334155" />
      <text x="602" y="140" fill="#CBD5E1" font-size="11">Chi tiết</text>

      <!-- Row 3 (Cận hạn 2d: Vàng cam + ⏳) -->
      <rect x="16" y="164" width="688" height="46" rx="4" fill="#1E293B" />
      <text x="30" y="192" fill="#38BDF8" font-size="13" font-weight="700">#3 (TP003)</text>
      <text x="110" y="192" fill="#FFF" font-size="13" font-weight="600">Thịt bò phi lê</text>
      <text x="250" y="192" fill="#E2E8F0" font-size="13">500 g</text>
      <text x="360" y="192" fill="#FBBF24" font-size="13">⏳ 17/11 (2d)</text>
      <text x="470" y="192" fill="#94A3B8" font-size="13">Ngăn đông</text>
      <rect x="590" y="176" width="55" height="24" rx="4" fill="#334155" />
      <text x="602" y="192" fill="#CBD5E1" font-size="11">Chi tiết</text>

      <!-- Row 4 (Cạn kho: Tím than) -->
      <rect x="16" y="216" width="688" height="46" rx="4" fill="#0F172A" />
      <text x="30" y="244" fill="#38BDF8" font-size="13" font-weight="700">#9 (TP009)</text>
      <text x="110" y="244" fill="#FFF" font-size="13" font-weight="600">Gạo ST25 (≤ min)</text>
      <text x="250" y="244" fill="#A5B4FC" font-size="13">1 kg / 2 kg</text>
      <rect x="360" y="227" width="84" height="22" rx="4" fill="#312E81" />
      <text x="370" y="242" fill="#E0E7FF" font-size="11" font-weight="700">◆ CẠN KHO</text>
      <text x="470" y="244" fill="#94A3B8" font-size="13">Kệ đồ khô</text>
      <rect x="590" y="228" width="55" height="24" rx="4" fill="#334155" />
      <text x="602" y="244" fill="#CBD5E1" font-size="11">Chi tiết</text>

      <!-- Row 5 (Hết hạn: Đỏ rực) -->
      <rect x="16" y="268" width="688" height="46" rx="4" fill="#1E293B" />
      <text x="30" y="296" fill="#38BDF8" font-size="13" font-weight="700">#0 (TP000)</text>
      <text x="110" y="296" fill="#FFF" font-size="13" font-weight="600">Sữa chua hết hạn</text>
      <text x="250" y="296" fill="#E2E8F0" font-size="13">2 hộp</text>
      <text x="360" y="296" fill="#F87171" font-size="13">! 15/11 (Tiêu hủy)</text>
      <text x="470" y="296" fill="#94A3B8" font-size="13">Ngăn mát</text>
      <rect x="590" y="280" width="55" height="24" rx="4" fill="#7F1D1D" />
      <text x="600" y="296" fill="#FCA5A5" font-size="11">Hủy lô</text>
    </g>

    <!-- Right: Slide-Over Detail Drawer DSK-03-D (Width: 390) -->
    <g id="Drawer_DSK-03-D" transform="translate(740, 120)">
      <rect x="0" y="0" width="390" height="560" rx="10" fill="#0B132B" stroke="#0F766E" stroke-width="1.5" filter="url(#shadow)" />
      
      <text x="20" y="32" fill="#FFF" font-size="17" font-weight="700">Chi Tiết Lô: item_id #1</text>
      <rect x="340" y="16" width="28" height="28" rx="14" fill="#334155" />
      <text x="350" y="34" fill="#FFF" font-size="13">✕</text>

      <rect x="20" y="55" width="350" height="120" rx="8" fill="#1E293B" />
      <text x="40" y="125" fill="#FFF" font-size="42">🥛</text>
      <text x="110" y="90" fill="#FFF" font-size="16" font-weight="700">Sữa tươi thanh trùng</text>
      <text x="110" y="112" fill="#94A3B8" font-size="12">Nhãn hiệu: TH True Milk</text>
      <rect x="110" y="124" width="112" height="22" rx="4" fill="#78350F" />
      <text x="118" y="139" fill="#FCD34D" font-size="11" font-weight="700">⏳ CÒN 1 NGÀY</text>

      <g transform="translate(20, 195)">
        <text x="0" y="20" fill="#94A3B8" font-size="13">current_quantity:</text>
        <text x="350" y="20" text-anchor="end" fill="#FFF" font-size="14" font-weight="700">2 Hộp (unit: Hộp)</text>

        <text x="0" y="50" fill="#94A3B8" font-size="13">import_date:</text>
        <text x="350" y="50" text-anchor="end" fill="#CBD5E1" font-size="13">10/11/2026 (item_id: #1)</text>

        <text x="0" y="80" fill="#94A3B8" font-size="13">expiration_date:</text>
        <text x="350" y="80" text-anchor="end" fill="#FBBF24" font-size="13" font-weight="700">⏳ 16/11/2026</text>

        <text x="0" y="110" fill="#94A3B8" font-size="13">location_name:</text>
        <text x="350" y="110" text-anchor="end" fill="#CBD5E1" font-size="13">Tủ lạnh &gt; Cánh tủ</text>

        <text x="0" y="140" fill="#94A3B8" font-size="13">min_threshold:</text>
        <text x="350" y="140" text-anchor="end" fill="#A5B4FC" font-size="13" font-weight="700">2 Hộp (Chạm min)</text>

        <text x="0" y="170" fill="#94A3B8" font-size="13">notes:</text>
        <text x="350" y="170" text-anchor="end" fill="#CBD5E1" font-size="13">Sữa tách béo TH</text>
      </g>

      <g transform="translate(20, 480)">
        <rect x="0" y="0" width="105" height="38" rx="6" fill="#0F766E" />
        <text x="24" y="24" fill="#FFF" font-size="13">Xuất kho</text>

        <rect x="115" y="0" width="115" height="38" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1" />
        <text x="130" y="24" fill="#E2E8F0" font-size="13">Đổi vị trí</text>

        <rect x="240" y="0" width="110" height="38" rx="6" fill="#7F1D1D" />
        <text x="258" y="24" fill="#FCA5A5" font-size="13">Vứt hủy</text>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// 4. DSK-04: Alerts Center
// ---------------------------------------------------------------------------
function renderDSK04() {
  return `${svgHeader(1440, 900, 'DSK-04: Alerts Center')}
  ${desktopChrome('DSK-04', 'Trung tâm cảnh báo')}
  <g id="Content_DSK-04" transform="translate(284, 116)">
    <text x="0" y="24" fill="#F8FAFC" font-size="22" font-weight="700">Trung Tâm Cảnh Báo Thông Minh &amp; Đề Xuất Mua Sắm</text>
    <text x="0" y="48" fill="#94A3B8" font-size="13">Quản lý các rủi ro lãng phí thực phẩm và định mức tồn kho tối thiểu</text>

    <!-- Tabs -->
    <g transform="translate(0, 70)">
      <rect x="0" y="0" width="220" height="40" rx="8" fill="#0F766E" />
      <text x="32" y="25" fill="#FFF" font-size="14" font-weight="700">Cảnh Báo Hết Hạn (3)</text>

      <rect x="230" y="0" width="220" height="40" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="255" y="25" fill="#94A3B8" font-size="14">Cảnh Báo Sắp Hết (2)</text>

      <rect x="460" y="0" width="220" height="40" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="480" y="25" fill="#94A3B8" font-size="14">Danh Sách Mua Sắm</text>
    </g>

    <!-- Alerts Feed (Chuẩn 4 màu vòng đời) -->
    <g transform="translate(0, 130)">
      <!-- 1. Đỏ rực: Quá hạn / Hết hạn hôm nay + cảnh báo tiêu hủy -->
      <rect x="0" y="0" width="1130" height="90" rx="8" fill="#1E293B" stroke="#EF4444" stroke-width="1.5" />
      <circle cx="40" cy="45" r="18" fill="#7F1D1D" />
      <text x="35" y="52" fill="#FCA5A5" font-size="18" font-weight="700">!</text>
      <text x="80" y="36" fill="#F87171" font-size="16" font-weight="700">Sữa chua không đường (LOT-000) đã hết hạn hôm nay — Cần tiêu hủy</text>
      <text x="80" y="60" fill="#94A3B8" font-size="13">Vị trí: Tủ lạnh &gt; Ngăn mát • Hạn dùng: 15/11/2026 • Không dùng chế biến</text>
      <rect x="960" y="28" width="140" height="34" rx="6" fill="#B91C1C" />
      <text x="985" y="50" fill="#FFF" font-size="13" font-weight="600">Vứt hủy ngay</text>

      <!-- 2. Vàng cam + ⏳: Cận hạn FEFO Cấp 1 (1-3 ngày) -->
      <rect x="0" y="110" width="1130" height="90" rx="8" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5" />
      <circle cx="40" cy="155" r="18" fill="#78350F" />
      <text x="31" y="162" fill="#FCD34D" font-size="16" font-weight="700">⏳</text>
      <text x="80" y="146" fill="#FCD34D" font-size="16" font-weight="700">⏳ Thịt bò phi lê (LOT-003) cận hạn FEFO Cấp 1 (Còn 2 ngày)</text>
      <text x="80" y="170" fill="#94A3B8" font-size="13">Vị trí: Tủ lạnh &gt; Ngăn mát • Hạn dùng: 17/11/2026 • Số lượng còn: 500 g</text>
      <rect x="960" y="138" width="140" height="34" rx="6" fill="#0F766E" />
      <text x="980" y="160" fill="#FFF" font-size="13" font-weight="600">Gợi ý chế biến</text>

      <!-- 3. Tím than: Cạn kho (current_quantity <= min_threshold) -->
      <rect x="0" y="220" width="1130" height="90" rx="8" fill="#1E293B" stroke="#818CF8" stroke-width="1.5" />
      <circle cx="40" cy="265" r="18" fill="#312E81" />
      <text x="33" y="271" fill="#E0E7FF" font-size="16" font-weight="700">◆</text>
      <text x="80" y="256" fill="#A5B4FC" font-size="16" font-weight="700">Gạo ST25 &amp; Trứng gà ta — Cạn kho (current_quantity ≤ min_threshold)</text>
      <text x="80" y="280" fill="#94A3B8" font-size="13">Tồn: 1 kg / Ngưỡng min: 2 kg • Cần mua thêm bổ sung vào Shopping List</text>
      <rect x="960" y="248" width="140" height="34" rx="6" fill="#312E81" stroke="#818CF8" />
      <text x="982" y="270" fill="#E0E7FF" font-size="13" font-weight="600">Cần mua thêm</text>

      <!-- 4. Xanh lục: An toàn (> 3 ngày) -->
      <rect x="0" y="330" width="1130" height="90" rx="8" fill="#1E293B" stroke="#10B981" stroke-width="1" />
      <circle cx="40" cy="375" r="18" fill="#064E3B" />
      <text x="34" y="382" fill="#6EE7B7" font-size="16" font-weight="700">✓</text>
      <text x="80" y="366" fill="#6EE7B7" font-size="16" font-weight="700">Sữa chua Vinamilk (LOT-002) — An toàn (Còn 13 ngày)</text>
      <text x="80" y="390" fill="#94A3B8" font-size="13">Vị trí: Tủ lạnh &gt; Ngăn mát • Hạn dùng: 28/11/2026 • Số lượng còn: 4 hộp</text>
      <rect x="960" y="358" width="140" height="34" rx="6" fill="#064E3B" />
      <text x="1000" y="380" fill="#6EE7B7" font-size="13" font-weight="600">An toàn</text>

      <!-- Shopping List Preview: Gom 3 quầy (GET /api/shopping-list) -->
      <g transform="translate(0, 438)">
        <rect x="0" y="0" width="1130" height="115" rx="10" fill="#0B132B" stroke="#818CF8" stroke-width="1" />
        <text x="20" y="28" fill="#E0E7FF" font-size="14" font-weight="700">Danh Sách Đi Chợ Gom 3 Quầy (GET /api/shopping-list — current_quantity ≤ min_threshold)</text>
        <rect x="20" y="44" width="345" height="56" rx="8" fill="#1E293B" stroke="#334155" />
        <text x="34" y="66" fill="#38BDF8" font-size="12" font-weight="700">1. Quầy Tươi sống</text>
        <text x="34" y="86" fill="#CBD5E1" font-size="12">Thịt bò (+500g), Trứng gà (+10 quả)</text>
        <rect x="392" y="44" width="345" height="56" rx="8" fill="#1E293B" stroke="#334155" />
        <text x="406" y="66" fill="#10B981" font-size="12" font-weight="700">2. Quầy Rau củ</text>
        <text x="406" y="86" fill="#CBD5E1" font-size="12">Rau cải thìa (+300g), Giá đỗ (+200g)</text>
        <rect x="764" y="44" width="345" height="56" rx="8" fill="#1E293B" stroke="#334155" />
        <text x="778" y="66" fill="#A5B4FC" font-size="12" font-weight="700">3. Quầy Đồ khô / Gia vị</text>
        <text x="778" y="86" fill="#CBD5E1" font-size="12">Gạo ST25 (+2kg), Sữa tươi (+2 hộp)</text>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// 5. DSK-05: Audit Logs
// ---------------------------------------------------------------------------
function renderDSK05() {
  return `${svgHeader(1440, 900, 'DSK-05: Audit Logs')}
  ${desktopChrome('DSK-05', 'Nhật ký kiểm toán')}
  <g id="Content_DSK-05" transform="translate(284, 116)">
    <text x="0" y="24" fill="#F8FAFC" font-size="22" font-weight="700">Sổ Kho &amp; Nhật Ký Biến Động Tồn Kho (Audit Logs)</text>
    <text x="0" y="48" fill="#94A3B8" font-size="13">Lưu trữ bất biến toàn bộ giao dịch bảng inventory_transactions (SQLite WAL + RLock)</text>

    <g transform="translate(0, 70)">
      <rect x="0" y="0" width="1130" height="600" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
      
      <rect x="16" y="16" width="1098" height="36" rx="6" fill="#334155" />
      <text x="32" y="39" fill="#CBD5E1" font-size="12" font-weight="600">transaction_id</text>
      <text x="145" y="39" fill="#CBD5E1" font-size="12" font-weight="600">transaction_time</text>
      <text x="290" y="39" fill="#CBD5E1" font-size="12" font-weight="600">action_type</text>
      <text x="435" y="39" fill="#CBD5E1" font-size="12" font-weight="600">food_name (item_id)</text>
      <text x="630" y="39" fill="#CBD5E1" font-size="12" font-weight="600">change_quantity</text>
      <text x="790" y="39" fill="#CBD5E1" font-size="12" font-weight="600">remaining_quantity</text>
      <text x="960" y="39" fill="#CBD5E1" font-size="12" font-weight="600">reason</text>

      <rect x="16" y="60" width="1098" height="46" rx="4" fill="#0F172A" />
      <text x="32" y="88" fill="#38BDF8" font-size="13" font-weight="600">#15</text>
      <text x="145" y="88" fill="#94A3B8" font-size="13">15/11/2026 21:15</text>
      <rect x="290" y="72" width="80" height="22" rx="4" fill="#78350F" /><text x="300" y="87" fill="#FCD34D" font-size="11" font-weight="700">SỬ DỤNG</text>
      <text x="435" y="88" fill="#FFF" font-size="13">Thịt bò phi lê (#3)</text>
      <text x="630" y="88" fill="#EF4444" font-size="13" font-weight="700">- 200 g</text>
      <text x="790" y="88" fill="#CBD5E1" font-size="13">300 g</text>
      <text x="960" y="88" fill="#94A3B8" font-size="13">Nấu bữa tối</text>

      <rect x="16" y="112" width="1098" height="46" rx="4" fill="#1E293B" />
      <text x="32" y="140" fill="#38BDF8" font-size="13" font-weight="600">#14</text>
      <text x="145" y="140" fill="#94A3B8" font-size="13">15/11/2026 14:02</text>
      <rect x="290" y="124" width="90" height="22" rx="4" fill="#064E3B" /><text x="300" y="139" fill="#6EE7B7" font-size="11" font-weight="700">NHẬP THÊM</text>
      <text x="435" y="140" fill="#FFF" font-size="13">Trứng gà ta (#8)</text>
      <text x="630" y="140" fill="#10B981" font-size="13" font-weight="700">+ 10 quả</text>
      <text x="790" y="140" fill="#CBD5E1" font-size="13">10 quả</text>
      <text x="960" y="140" fill="#94A3B8" font-size="13">Đi siêu thị WinMart</text>
    </g>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// 6. DSK-06: Catalog Management
// ---------------------------------------------------------------------------
function renderDSK06() {
  return `${svgHeader(1440, 900, 'DSK-06: Catalog Management')}
  ${desktopChrome('DSK-06', 'Quản lý danh mục')}
  <g id="Content_DSK-06" transform="translate(284, 116)">
    <text x="0" y="24" fill="#F8FAFC" font-size="22" font-weight="700">Quản Lý Danh Mục Nhóm Thực Phẩm, Đơn Vị &amp; Vị Trí</text>
    <text x="0" y="48" fill="#94A3B8" font-size="13">Cấu hình danh mục nền tảng sát chuẩn CSDL SQLite 3NF (database/schema.sql)</text>

    <g transform="translate(0, 70)">
      <!-- Card 1: Categories -->
      <rect x="0" y="0" width="360" height="580" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="20" y="32" fill="#F8FAFC" font-size="16" font-weight="700">Nhóm Thực Phẩm (7)</text>
      <rect x="260" y="14" width="80" height="28" rx="6" fill="#0F766E" /><text x="275" y="32" fill="#FFF" font-size="12">+ Thêm</text>
      <g transform="translate(20, 60)">
        <rect x="0" y="0" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="25" fill="#FFF" font-size="13">1. Thịt &amp; Thủy hải sản</text>
        <rect x="0" y="48" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="73" fill="#FFF" font-size="13">2. Rau củ quả tươi</text>
        <rect x="0" y="96" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="121" fill="#FFF" font-size="13">3. Trái cây tươi</text>
        <rect x="0" y="144" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="169" fill="#FFF" font-size="13">4. Sữa &amp; Chế phẩm từ sữa</text>
        <rect x="0" y="192" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="217" fill="#FFF" font-size="13">5. Đồ khô &amp; Gia vị</text>
      </g>

      <!-- Card 2: Units -->
      <g transform="translate(385, 0)">
        <rect x="0" y="0" width="360" height="580" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
        <text x="20" y="32" fill="#F8FAFC" font-size="16" font-weight="700">Đơn Vị Tính (8)</text>
        <rect x="260" y="14" width="80" height="28" rx="6" fill="#0F766E" /><text x="275" y="32" fill="#FFF" font-size="12">+ Thêm</text>
        <g transform="translate(20, 60)">
          <rect x="0" y="0" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="25" fill="#FFF" font-size="13">kg (Kilogram) - Chuẩn khối lượng</text>
          <rect x="0" y="48" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="73" fill="#FFF" font-size="13">g (Gram) - Quy đổi 1000g = 1kg</text>
          <rect x="0" y="96" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="121" fill="#FFF" font-size="13">lít (Liter) - Chuẩn thể tích</text>
          <rect x="0" y="144" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="169" fill="#FFF" font-size="13">ml (Milliliter) - 1000ml = 1 lít</text>
          <rect x="0" y="192" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="217" fill="#FFF" font-size="13">quả, hộp, gói, lon</text>
        </g>
      </g>

      <!-- Card 3: Locations -->
      <g transform="translate(770, 0)">
        <rect x="0" y="0" width="360" height="580" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
        <text x="20" y="32" fill="#F8FAFC" font-size="16" font-weight="700">Vị Trí Lưu Trữ 2 Cấp (8)</text>
        <rect x="260" y="14" width="80" height="28" rx="6" fill="#0F766E" /><text x="275" y="32" fill="#FFF" font-size="12">+ Thêm</text>
        <g transform="translate(20, 60)">
          <rect x="0" y="0" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="25" fill="#FFF" font-size="13">Tủ lạnh &gt; Ngăn mát</text>
          <rect x="0" y="48" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="73" fill="#FFF" font-size="13">Tủ lạnh &gt; Ngăn đông đá</text>
          <rect x="0" y="96" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="121" fill="#FFF" font-size="13">Tủ lạnh &gt; Hộc bảo quản rau</text>
          <rect x="0" y="144" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="169" fill="#FFF" font-size="13">Tủ lạnh &gt; Cánh cửa tủ</text>
          <rect x="0" y="192" width="320" height="40" rx="6" fill="#0F172A" /><text x="14" y="217" fill="#FFF" font-size="13">Ngoài tủ lạnh &gt; Kệ gia vị</text>
        </g>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// 7. DSK-07: Settings
// ---------------------------------------------------------------------------
function renderDSK07() {
  return `${svgHeader(1440, 900, 'DSK-07: Settings')}
  ${desktopChrome('DSK-07', 'Cấu hình máy chủ')}
  <g id="Content_DSK-07" transform="translate(284, 116)">
    <text x="0" y="24" fill="#F8FAFC" font-size="22" font-weight="700">Cấu Hình Kết Nối Client–Server &amp; Thông Số Hệ Thống</text>
    <text x="0" y="48" fill="#94A3B8" font-size="13">Quản lý địa chỉ IP/LAN, TCP Port 8080, kênh SSE (/api/events) và cơ chế sao lưu dữ liệu</text>

    <g transform="translate(0, 70)">
      <rect x="0" y="0" width="540" height="480" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="24" y="34" fill="#F8FAFC" font-size="16" font-weight="700">Thông Số Kết Nối Client–Server (LAN)</text>
      
      <g transform="translate(24, 60)">
        <text x="0" y="20" fill="#94A3B8" font-size="13">Địa chỉ IP/LAN Server:</text>
        <rect x="0" y="30" width="490" height="38" rx="6" fill="#0F172A" stroke="#334155" stroke-width="1" />
        <text x="16" y="54" fill="#38BDF8" font-size="14" font-weight="700">http://192.168.1.100:8080 (TCP Port 8080)</text>

        <text x="0" y="100" fill="#94A3B8" font-size="13">Giao thức truyền thông &amp; Realtime:</text>
        <rect x="0" y="110" width="490" height="38" rx="6" fill="#0F172A" stroke="#334155" stroke-width="1" />
        <text x="16" y="134" fill="#10B981" font-size="14" font-weight="700">HTTP/1.1 + REST JSON + SSE (/api/events)</text>

        <text x="0" y="180" fill="#94A3B8" font-size="13">Mã QR Mở Nhanh Địa Chỉ LAN (:8080):</text>
        <rect x="0" y="195" width="140" height="140" rx="8" fill="#FFF" />
        <rect x="15" y="210" width="30" height="30" fill="#000" /><rect x="22" y="217" width="16" height="16" fill="#FFF" />
        <rect x="95" y="210" width="30" height="30" fill="#000" /><rect x="102" y="217" width="16" height="16" fill="#FFF" />
        <rect x="15" y="290" width="30" height="30" fill="#000" /><rect x="22" y="297" width="16" height="16" fill="#FFF" />
        <rect x="55" y="250" width="30" height="30" fill="#000" />
      </g>

      <g transform="translate(565, 0)">
        <rect x="0" y="0" width="565" height="480" rx="10" fill="#1E293B" stroke="#334155" stroke-width="1" />
        <text x="24" y="34" fill="#F8FAFC" font-size="16" font-weight="700">Ngưỡng Cảnh Báo &amp; Dữ Liệu Ban Đầu</text>

        <g transform="translate(24, 60)">
          <text x="0" y="20" fill="#94A3B8" font-size="13">warning_days_threshold (Ngưỡng cảnh báo cận hạn):</text>
          <rect x="0" y="30" width="510" height="38" rx="6" fill="#0F172A" stroke="#334155" stroke-width="1" />
          <text x="16" y="54" fill="#FFF" font-size="14">3 Ngày (system_settings)</text>

          <text x="0" y="100" fill="#94A3B8" font-size="13">fefo_high_days / fefo_medium_days (Phân mức FEFO):</text>
          <rect x="0" y="110" width="510" height="38" rx="6" fill="#0F172A" stroke="#334155" stroke-width="1" />
          <text x="16" y="134" fill="#FFF" font-size="14">Cao: ≤ 2 Ngày • Trung bình: ≤ 5 Ngày</text>

          <rect x="0" y="180" width="510" height="80" rx="8" fill="#7F1D1D" opacity="0.3" stroke="#EF4444" stroke-width="1" />
          <text x="16" y="210" fill="#FCA5A5" font-size="14" font-weight="700">Khôi phục dữ liệu mẫu ban đầu (Reset Seed)</text>
          <text x="16" y="235" fill="#94A3B8" font-size="12">Đặt lại toàn bộ kho về 15 thực phẩm và 16 lô hàng mẫu</text>
          <rect x="380" y="200" width="115" height="34" rx="6" fill="#EF4444" />
          <text x="402" y="222" fill="#FFF" font-size="12" font-weight="700">Khôi phục</text>
        </g>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// 8. DSK-MODALS: Suite
// ---------------------------------------------------------------------------
function renderDSKModals() {
  return `${svgHeader(1440, 900, 'DSK-MODALS: Suite DSK-M01..M06')}
  <rect x="0" y="0" width="1440" height="900" fill="#090D16" />
  
  <rect x="40" y="40" width="1360" height="820" rx="16" fill="#0F172A" stroke="#1E293B" stroke-width="2" />
  <text x="70" y="80" fill="#FFF" font-size="24" font-weight="700">Bộ Hộp Thoại Desktop Server (Modals Suite: DSK-M01 .. DSK-M06)</text>
  <text x="70" y="106" fill="#94A3B8" font-size="14">Đặc tả form 12 trường IN01-IN12, phiếu trừ kho, công thức và khay hệ thống</text>

  <!-- Modal 1: Form Thêm Thực Phẩm DSK-M01 -->
  <g id="Modal_DSK-M01" transform="translate(70, 130)">
    <rect x="0" y="0" width="400" height="340" rx="12" fill="#1E293B" stroke="#0F766E" stroke-width="2" filter="url(#shadow)" />
    <text x="20" y="32" fill="#FFF" font-size="15" font-weight="700">DSK-M01: Thêm Lô Thực Phẩm Mới</text>
    <line x1="0" y1="46" x2="400" y2="46" stroke="#334155" />
    
    <text x="20" y="70" fill="#94A3B8" font-size="11">TÊN THỰC PHẨM (*)</text>
    <rect x="20" y="78" width="360" height="30" rx="4" fill="#0F172A" stroke="#334155" /><text x="30" y="98" fill="#FFF" font-size="12">Thịt heo ba chỉ</text>

    <text x="20" y="125" fill="#94A3B8" font-size="11">SỐ LƯỢNG &amp; ĐƠN VỊ (*)</text>
    <rect x="20" y="133" width="170" height="30" rx="4" fill="#0F172A" stroke="#334155" /><text x="30" y="153" fill="#FFF" font-size="12">800</text>
    <rect x="200" y="133" width="180" height="30" rx="4" fill="#0F172A" stroke="#334155" /><text x="210" y="153" fill="#FFF" font-size="12">g (Gram)</text>

    <text x="20" y="180" fill="#94A3B8" font-size="11">NGÀY HẾT HẠN (*)</text>
    <rect x="20" y="188" width="360" height="30" rx="4" fill="#0F172A" stroke="#334155" /><text x="30" y="208" fill="#FFF" font-size="12">20/11/2026</text>

    <text x="20" y="235" fill="#94A3B8" font-size="11">VỊ TRÍ LƯU TRỮ (*)</text>
    <rect x="20" y="243" width="360" height="30" rx="4" fill="#0F172A" stroke="#334155" /><text x="30" y="263" fill="#FFF" font-size="12">Tủ lạnh &gt; Ngăn mát</text>

    <rect x="20" y="290" width="170" height="36" rx="6" fill="#334155" /><text x="80" y="312" fill="#CBD5E1" font-size="12">Hủy</text>
    <rect x="210" y="290" width="170" height="36" rx="6" fill="#0F766E" /><text x="260" y="312" fill="#FFF" font-size="12" font-weight="700">Lưu kho</text>
  </g>

  <!-- Modal 2: Xuất / Dùng kho DSK-M02 -->
  <g id="Modal_DSK-M02" transform="translate(500, 130)">
    <rect x="0" y="0" width="400" height="340" rx="12" fill="#1E293B" stroke="#F59E0B" stroke-width="2" filter="url(#shadow)" />
    <text x="20" y="32" fill="#FFF" font-size="15" font-weight="700">DSK-M02: Phiếu Xuất / Dùng Kho</text>
    <line x1="0" y1="46" x2="400" y2="46" stroke="#334155" />
    
    <rect x="20" y="60" width="115" height="28" rx="4" fill="#0F766E" /><text x="45" y="78" fill="#FFF" font-size="11">Sử dụng</text>
    <rect x="142" y="60" width="115" height="28" rx="4" fill="#0F172A" /><text x="165" y="78" fill="#94A3B8" font-size="11">Điều chỉnh</text>
    <rect x="265" y="60" width="115" height="28" rx="4" fill="#0F172A" /><text x="295" y="78" fill="#94A3B8" font-size="11">Hủy bỏ</text>

    <text x="20" y="115" fill="#94A3B8" font-size="11">SỐ LƯỢNG DÙNG (TỒN HIỆN CÓ: 500g)</text>
    <rect x="20" y="125" width="360" height="34" rx="4" fill="#0F172A" stroke="#334155" /><text x="30" y="147" fill="#FCD34D" font-size="14" font-weight="700">200 g</text>

    <text x="20" y="180" fill="#94A3B8" font-size="11">MỤC ĐÍCH / LÝ DO GHI CHÚ</text>
    <rect x="20" y="190" width="360" height="60" rx="4" fill="#0F172A" stroke="#334155" /><text x="30" y="215" fill="#FFF" font-size="12">Nấu món Bò xào rau cải thìa</text>

    <rect x="20" y="290" width="170" height="36" rx="6" fill="#334155" /><text x="80" y="312" fill="#CBD5E1" font-size="12">Đóng</text>
    <rect x="210" y="290" width="170" height="36" rx="6" fill="#0F766E" /><text x="250" y="312" fill="#FFF" font-size="12" font-weight="700">Xác nhận trừ kho</text>
  </g>

  <!-- Modal 3: System Tray Popover DSK-M06 -->
  <g id="Modal_DSK-M06" transform="translate(930, 130)">
    <rect x="0" y="0" width="380" height="340" rx="12" fill="#0B132B" stroke="#38BDF8" stroke-width="2" filter="url(#shadow)" />
    <text x="20" y="32" fill="#38BDF8" font-size="15" font-weight="700">DSK-M06: System Tray Popover</text>
    <text x="20" y="50" fill="#94A3B8" font-size="11">Chạy ngầm khay hệ thống Windows Taskbar</text>
    <line x1="0" y1="60" x2="380" y2="60" stroke="#334155" />

    <g transform="translate(20, 75)">
      <circle cx="10" cy="12" r="5" fill="#10B981" />
      <text x="26" y="16" fill="#FFF" font-size="13" font-weight="600">Trạng thái: Máy chủ Đang Lắng Nghe</text>
      <text x="26" y="34" fill="#94A3B8" font-size="11">TCP Port 8080 • REST JSON + SSE (/api/events)</text>
    </g>

    <rect x="20" y="130" width="340" height="40" rx="6" fill="#1E293B" /><text x="36" y="155" fill="#E2E8F0" font-size="13">📂 Mở Cửa Sổ Chính Server</text>
    <rect x="20" y="180" width="340" height="40" rx="6" fill="#1E293B" /><text x="36" y="205" fill="#E2E8F0" font-size="13">🔔 Xem 3 Cảnh Báo Hết Hạn Gấp</text>
    <rect x="20" y="230" width="340" height="40" rx="6" fill="#1E293B" /><text x="36" y="255" fill="#E2E8F0" font-size="13">📱 Danh Sách Client Đang Ghép Nối (2)</text>
    <rect x="20" y="280" width="340" height="40" rx="6" fill="#7F1D1D" /><text x="36" y="305" fill="#FCA5A5" font-size="13">✕ Dừng Dịch Vụ &amp; Thoát Hoàn Toàn</text>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// MOBILE CHROME (390 x 844)
// ---------------------------------------------------------------------------
function mobileChrome(screenCode, title, activeTab) {
  const tabs = [
    { id: 'home', label: 'Trang chủ', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { id: 'inventory', label: 'Tủ lạnh', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { id: 'recipes', label: 'Món ăn', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
    { id: 'alerts', label: 'Cảnh báo', icon: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' },
    { id: 'settings', label: 'Cài đặt', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  ];
  let tabMarkup = '';
  let x = 0;
  for (const t of tabs) {
    const isActive = t.id === activeTab;
    const col = isActive ? '#0F766E' : '#94A3B8';
    const fontW = isActive ? '700' : '400';
    tabMarkup += `
      <g transform="translate(${x}, 0)">
        <path d="${t.icon}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(28, 10) scale(0.75)" />
        <text x="39" y="38" text-anchor="middle" fill="${col}" font-size="10" font-weight="${fontW}">${t.label}</text>
      </g>
    `;
    x += 78;
  }
  return `
    <rect x="0" y="0" width="390" height="844" rx="44" fill="#090D16" stroke="#1E293B" stroke-width="4" />
    <rect x="135" y="10" width="120" height="30" rx="15" fill="#000" />
    <text x="35" y="30" fill="#FFF" font-size="14" font-weight="600">9:41</text>
    <rect x="0" y="44" width="390" height="52" fill="#0F172A" />
    <text x="20" y="76" fill="#FFF" font-size="17" font-weight="700">${esc(title)}</text>
    <rect x="270" y="58" width="100" height="24" rx="12" fill="#064E3B" />
    <circle cx="282" cy="70" r="3.5" fill="#34D399" />
    <text x="292" y="74" fill="#6EE7B7" font-size="10" font-weight="700">SERVER OK</text>
    <g transform="translate(0, 770)">
      <rect x="0" y="0" width="390" height="74" fill="#0F172A" />
      <line x1="0" y1="0" x2="390" y2="0" stroke="#1E293B" stroke-width="1" />
      ${tabMarkup}
      <rect x="125" y="62" width="140" height="4" rx="2" fill="#64748B" />
    </g>
  `;
}

function renderMOB00() {
  return `${svgHeader(390, 844, 'MOB-00: Connect LAN Server')}
  <rect x="0" y="0" width="390" height="844" rx="44" fill="#090D16" stroke="#1E293B" stroke-width="4" />
  <rect x="135" y="10" width="120" height="30" rx="15" fill="#000" />
  
  <g transform="translate(20, 120)">
    <rect x="130" y="0" width="90" height="90" rx="24" fill="url(#primaryGrad)" filter="url(#shadow)" />
    <text x="155" y="58" fill="#FFF" font-size="42">🥬</text>

    <text x="175" y="125" text-anchor="middle" fill="#FFF" font-size="20" font-weight="700">FoodManagement Client</text>
    <text x="175" y="150" text-anchor="middle" fill="#94A3B8" font-size="13">Kết nối Desktop Server qua mạng LAN (:8080)</text>

    <g transform="translate(0, 190)">
      <text x="10" y="18" fill="#94A3B8" font-size="12">ĐỊA CHỈ IP / CỔNG DESKTOP SERVER</text>
      <rect x="0" y="28" width="350" height="46" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="16" y="57" fill="#38BDF8" font-size="15" font-weight="600">http://192.168.1.100:8080</text>

      <text x="10" y="105" fill="#94A3B8" font-size="12">GIAO THỨC &amp; KÊNH REALTIME</text>
      <rect x="0" y="115" width="350" height="46" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
      <text x="16" y="143" fill="#10B981" font-size="13" font-weight="700">HTTP/1.1 + REST JSON + SSE (/api/events)</text>

      <g cursor="pointer" transform="translate(0, 190)">
        <rect x="0" y="0" width="350" height="50" rx="10" fill="#0F766E" filter="url(#shadow)" />
        <text x="175" y="31" text-anchor="middle" fill="#FFF" font-size="14" font-weight="700">KIỂM TRA KẾT NỐI (/api/status)</text>
      </g>

      <g cursor="pointer" transform="translate(0, 255)">
        <rect x="0" y="0" width="350" height="50" rx="10" fill="#1E293B" stroke="#64748B" stroke-width="1" stroke-dasharray="4 3" />
        <text x="175" y="31" text-anchor="middle" fill="#94A3B8" font-size="13" font-weight="600">📷 QUÉT QR LAN [Future Scope]</text>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

function renderMOB01() {
  return `${svgHeader(390, 844, 'MOB-01: Home FEFO')}
  ${mobileChrome('MOB-01', 'Quản Lý Thực Phẩm', 'home')}
  <g transform="translate(16, 110)">
    <rect x="0" y="0" width="358" height="130" rx="14" fill="url(#primaryGrad)" filter="url(#shadow)" />
    <text x="18" y="28" fill="#CCFBF1" font-size="11" font-weight="700" letter-spacing="1">GỢI Ý HÔM NAY (FEFO)</text>
    <text x="18" y="56" fill="#FFF" font-size="17" font-weight="700">Bò Xào Cải Thìa</text>
    <text x="18" y="78" fill="#E6FFFA" font-size="12">Giải quyết 2 lô sắp hết hạn (Bò + Cải)</text>
    <rect x="18" y="90" width="110" height="26" rx="13" fill="#FFF" />
    <text x="32" y="107" fill="#0F766E" font-size="11" font-weight="700">Nấu ngay ➔</text>

    <g transform="translate(0, 150)">
      <rect x="0" y="0" width="112" height="74" rx="10" fill="#1E293B" stroke="#64748B" stroke-dasharray="4 3" />
      <text x="56" y="28" text-anchor="middle" fill="#94A3B8" font-size="18">📷</text>
      <text x="56" y="48" text-anchor="middle" fill="#94A3B8" font-size="10">AI Scan</text>
      <text x="56" y="63" text-anchor="middle" fill="#64748B" font-size="9">[Future Scope]</text>

      <rect x="123" y="0" width="112" height="74" rx="10" fill="#1E293B" stroke="#334155" />
      <text x="179" y="32" text-anchor="middle" fill="#FFF" font-size="20">➕</text>
      <text x="179" y="56" text-anchor="middle" fill="#CBD5E1" font-size="11">Nhập thực phẩm</text>

      <rect x="246" y="0" width="112" height="74" rx="10" fill="#1E293B" stroke="#334155" />
      <text x="302" y="32" text-anchor="middle" fill="#FFF" font-size="20">🔔</text>
      <text x="302" y="56" text-anchor="middle" fill="#CBD5E1" font-size="11">3 Cảnh báo</text>
    </g>

    <g transform="translate(0, 245)">
      <text x="0" y="18" fill="#FFF" font-size="15" font-weight="700">Cần Dùng Trước (Quick Use 1 chạm)</text>
      <text x="358" y="18" text-anchor="end" fill="#38BDF8" font-size="12">Xem tất cả</text>

      <!-- Card 1 (Thumb-friendly >=44px Quick Use button) -->
      <g transform="translate(0, 30)">
        <rect x="0" y="0" width="358" height="92" rx="10" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5" />
        <rect x="10" y="10" width="44" height="44" rx="8" fill="#0F172A" />
        <text x="21" y="39" fill="#FFF" font-size="20">🥛</text>
        <text x="64" y="27" fill="#FFF" font-size="14" font-weight="700">Sữa tươi thanh trùng</text>
        <text x="64" y="45" fill="#94A3B8" font-size="11">2 Hộp • Cánh tủ lạnh</text>
        <rect x="252" y="12" width="96" height="24" rx="6" fill="#78350F" />
        <text x="260" y="28" fill="#FCD34D" font-size="10" font-weight="700">⏳ Còn 1 ngày</text>
        <text x="12" y="72" fill="#94A3B8" font-size="11">Chạm thẻ để tùy chỉnh</text>
        <rect x="234" y="42" width="114" height="44" rx="8" fill="#0F766E" />
        <text x="291" y="69" text-anchor="middle" fill="#FFF" font-size="12" font-weight="700">-1 Dùng nhanh</text>
      </g>

      <!-- Card 2 -->
      <g transform="translate(0, 132)">
        <rect x="0" y="0" width="358" height="92" rx="10" fill="#1E293B" stroke="#F59E0B" stroke-width="1" />
        <rect x="10" y="10" width="44" height="44" rx="8" fill="#0F172A" />
        <text x="21" y="39" fill="#FFF" font-size="20">🥩</text>
        <text x="64" y="27" fill="#FFF" font-size="14" font-weight="700">Thịt bò phi lê</text>
        <text x="64" y="45" fill="#94A3B8" font-size="11">500 g • Ngăn mát tủ lạnh</text>
        <rect x="252" y="12" width="96" height="24" rx="6" fill="#78350F" />
        <text x="260" y="28" fill="#FCD34D" font-size="10" font-weight="700">⏳ Còn 2 ngày</text>
        <text x="12" y="72" fill="#94A3B8" font-size="11">Chạm thẻ để tùy chỉnh</text>
        <rect x="234" y="42" width="114" height="44" rx="8" fill="#0F766E" />
        <text x="291" y="69" text-anchor="middle" fill="#FFF" font-size="12" font-weight="700">-1 Dùng nhanh</text>
      </g>

      <!-- Card 3 -->
      <g transform="translate(0, 234)">
        <rect x="0" y="0" width="358" height="92" rx="10" fill="#1E293B" stroke="#F59E0B" stroke-width="1" />
        <rect x="10" y="10" width="44" height="44" rx="8" fill="#0F172A" />
        <text x="21" y="39" fill="#FFF" font-size="20">🥬</text>
        <text x="64" y="27" fill="#FFF" font-size="14" font-weight="700">Rau cải thìa</text>
        <text x="64" y="45" fill="#94A3B8" font-size="11">300 g • Hộc rau củ</text>
        <rect x="252" y="12" width="96" height="24" rx="6" fill="#78350F" />
        <text x="260" y="28" fill="#FCD34D" font-size="10" font-weight="700">⏳ Còn 3 ngày</text>
        <text x="12" y="72" fill="#94A3B8" font-size="11">Chạm thẻ để tùy chỉnh</text>
        <rect x="234" y="42" width="114" height="44" rx="8" fill="#0F766E" />
        <text x="291" y="69" text-anchor="middle" fill="#FFF" font-size="12" font-weight="700">-1 Dùng nhanh</text>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

function renderMOB02() {
  return `${svgHeader(390, 844, 'MOB-02: Mobile Inventory')}
  ${mobileChrome('MOB-02', 'Kho Tủ Lạnh', 'inventory')}
  <g transform="translate(16, 105)">
    <rect x="0" y="0" width="295" height="40" rx="8" fill="#1E293B" stroke="#334155" />
    <text x="14" y="25" fill="#94A3B8" font-size="13">🔍 Tìm tên món, mã lô...</text>
    <rect x="305" y="0" width="53" height="40" rx="8" fill="#0F766E" />
    <text x="323" y="25" fill="#FFF" font-size="14">⚙</text>

    <g transform="translate(0, 52)">
      <rect x="0" y="0" width="70" height="28" rx="14" fill="#0F766E" /><text x="18" y="18" fill="#FFF" font-size="11" font-weight="700">Tất cả</text>
      <rect x="76" y="0" width="90" height="28" rx="14" fill="#1E293B" /><text x="92" y="18" fill="#CBD5E1" font-size="11">Ngăn mát</text>
      <rect x="172" y="0" width="90" height="28" rx="14" fill="#1E293B" /><text x="187" y="18" fill="#CBD5E1" font-size="11">Ngăn đông</text>
      <rect x="268" y="0" width="90" height="28" rx="14" fill="#1E293B" /><text x="282" y="18" fill="#CBD5E1" font-size="11">Cánh tủ</text>
    </g>

    <g transform="translate(0, 95)">
      <rect x="0" y="0" width="358" height="82" rx="10" fill="#1E293B" stroke="#F59E0B" />
      <text x="16" y="48" fill="#FFF" font-size="28">🥛</text>
      <text x="60" y="28" fill="#FFF" font-size="14" font-weight="700">Sữa tươi thanh trùng</text>
      <text x="60" y="48" fill="#94A3B8" font-size="11">Tồn: 2 Hộp (900 ml) • LOT-001</text>
      <text x="60" y="66" fill="#FBBF24" font-size="11" font-weight="600">⏳ HSD: 16/11/2026 (Còn 1 ngày)</text>
      <rect x="290" y="26" width="55" height="30" rx="6" fill="#0F766E" /><text x="302" y="45" fill="#FFF" font-size="11">Dùng</text>

      <g transform="translate(0, 92)">
        <rect x="0" y="0" width="358" height="82" rx="10" fill="#1E293B" stroke="#F59E0B" />
        <text x="16" y="48" fill="#FFF" font-size="28">🥩</text>
        <text x="60" y="28" fill="#FFF" font-size="14" font-weight="700">Thịt bò phi lê</text>
        <text x="60" y="48" fill="#94A3B8" font-size="11">Tồn: 500 g • LOT-003</text>
        <text x="60" y="66" fill="#FBBF24" font-size="11" font-weight="600">⏳ HSD: 17/11/2026 (Còn 2 ngày)</text>
        <rect x="290" y="26" width="55" height="30" rx="6" fill="#0F766E" /><text x="302" y="45" fill="#FFF" font-size="11">Dùng</text>
      </g>

      <g transform="translate(0, 184)">
        <rect x="0" y="0" width="358" height="82" rx="10" fill="#1E293B" stroke="#10B981" />
        <text x="16" y="48" fill="#FFF" font-size="28">🥚</text>
        <text x="60" y="28" fill="#FFF" font-size="14" font-weight="700">Trứng gà ta</text>
        <text x="60" y="48" fill="#94A3B8" font-size="11">Tồn: 10 quả • LOT-008</text>
        <text x="60" y="66" fill="#10B981" font-size="11">An toàn: 22/11/2026 (Còn 7 ngày)</text>
        <rect x="290" y="26" width="55" height="30" rx="6" fill="#334155" /><text x="302" y="45" fill="#CBD5E1" font-size="11">Dùng</text>
      </g>

      <g transform="translate(0, 276)">
        <rect x="0" y="0" width="358" height="82" rx="10" fill="#1E293B" stroke="#818CF8" />
        <text x="16" y="48" fill="#FFF" font-size="28">🌾</text>
        <text x="60" y="28" fill="#FFF" font-size="14" font-weight="700">Gạo ST25 (≤ min_threshold)</text>
        <text x="60" y="48" fill="#A5B4FC" font-size="11">Tồn: 1 kg / Min: 2 kg • LOT-009</text>
        <rect x="60" y="55" width="90" height="20" rx="4" fill="#312E81" /><text x="68" y="69" fill="#E0E7FF" font-size="10" font-weight="700">◆ CẠN KHO</text>
        <rect x="290" y="26" width="55" height="30" rx="6" fill="#312E81" stroke="#818CF8" /><text x="297" y="45" fill="#E0E7FF" font-size="11">Mua</text>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

function renderMOB03() {
  return `${svgHeader(390, 844, 'MOB-03: Food Detail &amp; Action Sheet')}
  ${mobileChrome('MOB-03', 'Chi Tiết Thực Phẩm', 'inventory')}
  <g transform="translate(16, 110)">
    <rect x="0" y="0" width="358" height="210" rx="12" fill="#1E293B" stroke="#334155" />
    <rect x="16" y="16" width="326" height="110" rx="8" fill="#0F172A" />
    <text x="179" y="80" text-anchor="middle" fill="#FFF" font-size="48">🥩</text>
    <text x="20" y="155" fill="#FFF" font-size="18" font-weight="700">Thịt bò phi lê tươi</text>
    <text x="20" y="178" fill="#94A3B8" font-size="12">Mã lô: LOT-003 • Nhập: 10/11/2026</text>
    <rect x="242" y="145" width="102" height="26" rx="6" fill="#78350F" />
    <text x="250" y="162" fill="#FCD34D" font-size="11" font-weight="700">⏳ Còn 2 ngày</text>

    <g transform="translate(0, 225)">
      <rect x="0" y="0" width="358" height="150" rx="10" fill="#1E293B" stroke="#334155" />
      <text x="16" y="30" fill="#94A3B8" font-size="12">Tồn hiện tại:</text><text x="340" y="30" text-anchor="end" fill="#FFF" font-size="14" font-weight="700">500 g</text>
      <line x1="16" y1="44" x2="340" y2="44" stroke="#334155" />
      <text x="16" y="70" fill="#94A3B8" font-size="12">Vị trí lưu trữ:</text><text x="340" y="70" text-anchor="end" fill="#CBD5E1" font-size="13">Tủ lạnh &gt; Ngăn mát</text>
      <line x1="16" y1="84" x2="340" y2="84" stroke="#334155" />
      <text x="16" y="110" fill="#94A3B8" font-size="12">Hạn sử dụng:</text><text x="340" y="110" text-anchor="end" fill="#FBBF24" font-size="14" font-weight="700">⏳ 17/11/2026</text>
      <line x1="16" y1="124" x2="340" y2="124" stroke="#334155" />
      <text x="16" y="142" fill="#94A3B8" font-size="12">Ghi chú:</text><text x="340" y="142" text-anchor="end" fill="#94A3B8" font-size="12">Mua tại siêu thị WinMart</text>
    </g>

    <g transform="translate(0, 395)">
      <rect x="0" y="0" width="358" height="240" rx="14" fill="#0B132B" stroke="#0F766E" stroke-width="2" filter="url(#shadow)" />
      <text x="20" y="30" fill="#FFF" font-size="15" font-weight="700">MOB-S01: Dùng Thực Phẩm (Trừ Kho)</text>
      <text x="20" y="50" fill="#94A3B8" font-size="11">Chọn khối lượng cần sử dụng:</text>

      <g transform="translate(20, 68)">
        <rect x="0" y="0" width="60" height="50" rx="8" fill="#1E293B" stroke="#334155" />
        <text x="30" y="32" text-anchor="middle" fill="#FFF" font-size="24">−</text>

        <rect x="75" y="0" width="168" height="50" rx="8" fill="#0F172A" stroke="#0F766E" />
        <text x="159" y="32" text-anchor="middle" fill="#38BDF8" font-size="20" font-weight="700">200 g</text>

        <rect x="258" y="0" width="60" height="50" rx="8" fill="#1E293B" stroke="#334155" />
        <text x="288" y="32" text-anchor="middle" fill="#FFF" font-size="24">+</text>
      </g>

      <g transform="translate(20, 132)">
        <rect x="0" y="0" width="70" height="28" rx="14" fill="#1E293B" /><text x="18" y="18" fill="#CBD5E1" font-size="11">100g</text>
        <rect x="80" y="0" width="70" height="28" rx="14" fill="#0F766E" /><text x="98" y="18" fill="#FFF" font-size="11" font-weight="700">200g</text>
        <rect x="160" y="0" width="70" height="28" rx="14" fill="#1E293B" /><text x="178" y="18" fill="#CBD5E1" font-size="11">300g</text>
        <rect x="240" y="0" width="78" height="28" rx="14" fill="#78350F" /><text x="252" y="18" fill="#FCD34D" font-size="11">Dùng hết</text>
      </g>

      <g cursor="pointer" transform="translate(20, 175)">
        <rect x="0" y="0" width="318" height="46" rx="8" fill="#0F766E" />
        <text x="159" y="28" text-anchor="middle" fill="#FFF" font-size="14" font-weight="700">XÁC NHẬN DÙNG (CÒN LẠI 300g)</text>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

function renderMOB04() {
  return `${svgHeader(390, 844, 'MOB-04: Recipes Menu')}
  ${mobileChrome('MOB-04', 'Gợi Ý Món Ăn', 'recipes')}
  <g transform="translate(16, 110)">
    <text x="0" y="20" fill="#FFF" font-size="16" font-weight="700">Gợi Ý Món Ăn (Match Score +30%)</text>
    <text x="0" y="40" fill="#94A3B8" font-size="12">Ưu tiên cận hạn (+30%), bỏ qua gia vị cơ bản</text>

    <g transform="translate(0, 55)">
      <rect x="0" y="0" width="358" height="145" rx="12" fill="#1E293B" stroke="#0F766E" stroke-width="1.5" />
      <text x="16" y="28" fill="#38BDF8" font-size="14" font-weight="700">BÒ XÀO RAU CẢI THÌA</text>
      <rect x="218" y="12" width="128" height="24" rx="12" fill="#064E3B" />
      <text x="282" y="28" text-anchor="middle" fill="#6EE7B7" font-size="10" font-weight="700">100% (+30% cận hạn)</text>

      <text x="16" y="55" fill="#E2E8F0" font-size="12">Nguyên liệu: 300g Thịt bò, 250g Cải thìa, Tỏi</text>
      <text x="16" y="75" fill="#FCD34D" font-size="11" font-weight="600">⏳ Giải quyết 2 lô cận hạn (1–3 ngày tới)</text>

      <rect x="16" y="95" width="150" height="36" rx="6" fill="#0F766E" />
      <text x="32" y="118" fill="#FFF" font-size="12" font-weight="700">Nấu món này (Trừ kho)</text>

      <rect x="180" y="95" width="160" height="36" rx="6" fill="#0F172A" stroke="#334155" />
      <text x="205" y="118" fill="#CBD5E1" font-size="12">Xem cách nấu</text>
    </g>

    <g transform="translate(0, 215)">
      <rect x="0" y="0" width="358" height="145" rx="12" fill="#1E293B" stroke="#334155" />
      <text x="16" y="28" fill="#FFF" font-size="14" font-weight="700">CANH CHUA CÁ LÓC NAM BỘ</text>
      <rect x="218" y="12" width="128" height="24" rx="12" fill="#78350F" />
      <text x="282" y="28" text-anchor="middle" fill="#FCD34D" font-size="10" font-weight="700">80% (trừ gia vị)</text>

      <text x="16" y="55" fill="#E2E8F0" font-size="12">Có sẵn: Cá lóc đồng, Cà chua chín</text>
      <text x="16" y="75" fill="#38BDF8" font-size="11">Cần mua thêm: Giá đỗ, Dọc mùng</text>

      <rect x="16" y="95" width="180" height="36" rx="6" fill="#1E293B" stroke="#38BDF8" />
      <text x="28" y="118" fill="#38BDF8" font-size="12">+ Thêm vào Shopping List</text>
    </g>

    <g transform="translate(0, 375)">
      <rect x="0" y="0" width="358" height="145" rx="12" fill="#1E293B" stroke="#334155" />
      <text x="16" y="28" fill="#FFF" font-size="15" font-weight="700">TRỨNG CHIÊN CÀ CHUA</text>
      <rect x="250" y="12" width="95" height="24" rx="12" fill="#064E3B" />
      <text x="260" y="28" fill="#6EE7B7" font-size="11" font-weight="700">Có sẵn 100%</text>
      <text x="16" y="55" fill="#E2E8F0" font-size="12">Nguyên liệu: 3 quả Trứng gà, 2 quả Cà chua</text>
      <text x="16" y="75" fill="#10B981" font-size="11">Đơn giản, chế biến nhanh trong 10 phút</text>

      <rect x="16" y="95" width="150" height="36" rx="6" fill="#0F766E" />
      <text x="32" y="118" fill="#FFF" font-size="12" font-weight="700">Nấu món này (Trừ kho)</text>
    </g>
  </g>
  ${svgFooter()}`;
}

function renderMOB05() {
  return `${svgHeader(390, 844, 'MOB-05: Alerts &amp; Shopping')}
  ${mobileChrome('MOB-05', 'Cảnh Báo &amp; Mua Sắm', 'alerts')}
  <g transform="translate(16, 110)">
    <rect x="0" y="0" width="175" height="36" rx="8" fill="#0F766E" /><text x="40" y="23" fill="#FFF" font-size="13" font-weight="700">Cảnh Báo (3)</text>
    <rect x="183" y="0" width="175" height="36" rx="8" fill="#1E293B" /><text x="220" y="23" fill="#94A3B8" font-size="13">Cần Mua Sắm (4)</text>

    <g transform="translate(0, 55)">
      <!-- Đỏ rực: Quá hạn / Hết hạn hôm nay -->
      <rect x="0" y="0" width="358" height="90" rx="10" fill="#1E293B" stroke="#EF4444" stroke-width="1.5" />
      <circle cx="28" cy="45" r="14" fill="#7F1D1D" /><text x="24" y="50" fill="#FCA5A5" font-size="14" font-weight="700">!</text>
      <text x="52" y="32" fill="#F87171" font-size="13" font-weight="700">Sữa chua không đường (Hết hạn)</text>
      <text x="52" y="52" fill="#94A3B8" font-size="11">HSD: 15/11/2026 • Cần tiêu hủy</text>
      <rect x="250" y="48" width="95" height="28" rx="6" fill="#B91C1C" /><text x="268" y="66" fill="#FFF" font-size="11">Vứt hủy</text>

      <!-- Vàng cam + ⏳: Cận hạn 1-3 ngày -->
      <g transform="translate(0, 102)">
        <rect x="0" y="0" width="358" height="90" rx="10" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5" />
        <circle cx="28" cy="45" r="14" fill="#78350F" /><text x="21" y="50" fill="#FCD34D" font-size="13" font-weight="700">⏳</text>
        <text x="52" y="32" fill="#FCD34D" font-size="13" font-weight="700">⏳ Thịt bò phi lê (Còn 2 ngày)</text>
        <text x="52" y="52" fill="#94A3B8" font-size="11">HSD: 17/11/2026 • Còn 500 g</text>
        <rect x="250" y="48" width="95" height="28" rx="6" fill="#0F766E" /><text x="262" y="66" fill="#FFF" font-size="11">Nấu/Dùng</text>
      </g>

      <!-- Tím than: Cạn kho (current_quantity <= min_threshold) -->
      <g transform="translate(0, 204)">
        <rect x="0" y="0" width="358" height="90" rx="10" fill="#1E293B" stroke="#818CF8" stroke-width="1.5" />
        <circle cx="28" cy="45" r="14" fill="#312E81" /><text x="22" y="50" fill="#E0E7FF" font-size="13" font-weight="700">◆</text>
        <text x="52" y="32" fill="#A5B4FC" font-size="13" font-weight="700">Gạo ST25 (Cạn kho ≤ min)</text>
        <text x="52" y="52" fill="#94A3B8" font-size="11">Còn 1 kg / min_threshold 2 kg</text>
        <rect x="250" y="48" width="95" height="28" rx="6" fill="#312E81" stroke="#818CF8" /><text x="260" y="66" fill="#E0E7FF" font-size="11">Mua thêm</text>
      </g>

      <!-- Shopping List 3 Quầy Preview -->
      <g transform="translate(0, 306)">
        <rect x="0" y="0" width="358" height="110" rx="10" fill="#0B132B" stroke="#818CF8" stroke-width="1" />
        <text x="14" y="24" fill="#E0E7FF" font-size="12" font-weight="700">Shopping List Gom 3 Quầy (GET /api/shopping-list)</text>
        <text x="14" y="48" fill="#38BDF8" font-size="11">1. Quầy Tươi sống: <tspan fill="#CBD5E1">Thịt bò (+500g), Trứng (+10)</tspan></text>
        <text x="14" y="70" fill="#10B981" font-size="11">2. Quầy Rau củ: <tspan fill="#CBD5E1">Cải thìa (+300g), Giá đỗ (+200g)</tspan></text>
        <text x="14" y="92" fill="#A5B4FC" font-size="11">3. Quầy Đồ khô: <tspan fill="#CBD5E1">Gạo ST25 (+2kg), Sữa (+2 hộp)</tspan></text>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

function renderMOB06() {
  return `${svgHeader(390, 844, 'MOB-06: Add Food &amp; AI Scan')}
  ${mobileChrome('MOB-06', 'Nhập Thực Phẩm', 'inventory')}
  <g transform="translate(16, 105)">
    <rect x="0" y="0" width="358" height="65" rx="10" fill="#1E293B" stroke="#64748B" stroke-dasharray="4 3" />
    <text x="18" y="28" fill="#CBD5E1" font-size="13" font-weight="700">📷 Quét AI Scan [Future Scope]</text>
    <text x="18" y="48" fill="#94A3B8" font-size="11">Chưa có trong 15 REST APIs — nhập tay qua POST /api/food/add</text>

    <g transform="translate(0, 80)">
      <text x="0" y="16" fill="#94A3B8" font-size="11">TÊN THỰC PHẨM (*)</text>
      <rect x="0" y="24" width="358" height="42" rx="6" fill="#1E293B" stroke="#334155" />
      <text x="14" y="50" fill="#FFF" font-size="14">Cá lóc đồng làm sạch</text>

      <text x="0" y="90" fill="#94A3B8" font-size="11">NHÓM DANH MỤC</text>
      <rect x="0" y="98" width="358" height="42" rx="6" fill="#1E293B" stroke="#334155" />
      <text x="14" y="124" fill="#E2E8F0" font-size="14">Thịt &amp; Thủy hải sản</text>

      <g transform="translate(0, 164)">
        <text x="0" y="0" fill="#94A3B8" font-size="11">SỐ LƯỢNG (*)</text>
        <rect x="0" y="8" width="170" height="42" rx="6" fill="#1E293B" stroke="#334155" />
        <text x="14" y="34" fill="#FFF" font-size="14">600</text>

        <text x="188" y="0" fill="#94A3B8" font-size="11">ĐƠN VỊ TÍNH (*)</text>
        <rect x="188" y="8" width="170" height="42" rx="6" fill="#1E293B" stroke="#334155" />
        <text x="202" y="34" fill="#FFF" font-size="14">g (Gram)</text>
      </g>

      <text x="0" y="238" fill="#94A3B8" font-size="11">expiration_date (*) &amp; min_threshold</text>
      <rect x="0" y="246" width="215" height="42" rx="6" fill="#1E293B" stroke="#334155" />
      <text x="14" y="272" fill="#38BDF8" font-size="13" font-weight="700">19/11/2026 (4d)</text>
      <rect x="225" y="246" width="133" height="42" rx="6" fill="#1E293B" stroke="#818CF8" />
      <text x="237" y="272" fill="#A5B4FC" font-size="13" font-weight="700">Min: 200 g</text>

      <text x="0" y="312" fill="#94A3B8" font-size="11">VỊ TRÍ LƯU TRỮ (*)</text>
      <rect x="0" y="320" width="358" height="42" rx="6" fill="#1E293B" stroke="#334155" />
      <text x="14" y="346" fill="#E2E8F0" font-size="14">Tủ lạnh &gt; Ngăn đông đá</text>

      <g cursor="pointer" transform="translate(0, 390)">
        <rect x="0" y="0" width="358" height="50" rx="10" fill="#0F766E" filter="url(#shadow)" />
        <text x="179" y="31" text-anchor="middle" fill="#FFF" font-size="15" font-weight="700">LƯU VÀO KHO (ĐỒNG BỘ SERVER)</text>
      </g>
    </g>
  </g>
  ${svgFooter()}`;
}

function renderMOB07() {
  return `${svgHeader(390, 844, 'MOB-07: Stats &amp; Settings')}
  ${mobileChrome('MOB-07', 'Cài Đặt &amp; Thống Kê', 'settings')}
  <g transform="translate(16, 110)">
    <rect x="0" y="0" width="358" height="95" rx="10" fill="#1E293B" stroke="#0F766E" />
    <circle cx="24" cy="28" r="6" fill="#10B981" />
    <text x="38" y="32" fill="#FFF" font-size="14" font-weight="700">Đã Kết Nối Desktop Server</text>
    <text x="18" y="56" fill="#94A3B8" font-size="12">Địa chỉ: http://192.168.1.100:8080 (TCP Port 8080)</text>
    <text x="18" y="78" fill="#38BDF8" font-size="11">Giao thức: HTTP/1.1 + REST JSON + SSE (/api/events)</text>

    <g transform="translate(0, 110)">
      <rect x="0" y="0" width="358" height="130" rx="10" fill="#1E293B" stroke="#334155" />
      <text x="18" y="28" fill="#FFF" font-size="14" font-weight="700">Thống Kê Tuần Này</text>
      
      <g transform="translate(18, 45)">
        <text x="0" y="20" fill="#94A3B8" font-size="12">Đã sử dụng:</text><text x="322" y="20" text-anchor="end" fill="#10B981" font-size="13" font-weight="700">8 mặt hàng (4.2 kg)</text>
        <text x="0" y="48" fill="#94A3B8" font-size="12">Lãng phí / Vứt hủy:</text><text x="322" y="48" text-anchor="end" fill="#38BDF8" font-size="13" font-weight="700">0 mặt hàng (0%)</text>
        <text x="0" y="74" fill="#94A3B8" font-size="12">Lô đang theo dõi (food_items):</text><text x="322" y="74" text-anchor="end" fill="#A5B4FC" font-size="13" font-weight="700">16 lô / 15 món</text>
      </g>
    </g>

    <g transform="translate(0, 255)">
      <rect x="0" y="0" width="358" height="50" rx="8" fill="#1E293B" /><text x="18" y="31" fill="#E2E8F0" font-size="13">📂 Xem Nhật Ký Giao Dịch Gần Đây</text><text x="335" y="31" fill="#94A3B8" font-size="14">➔</text>
      <rect x="0" y="60" width="358" height="50" rx="8" fill="#1E293B" /><text x="18" y="91" fill="#E2E8F0" font-size="13">🔔 Cài Đặt Thông Báo Hạn Dùng</text><text x="335" y="91" fill="#94A3B8" font-size="14">➔</text>
      <rect x="0" y="120" width="358" height="50" rx="8" fill="#1E293B" stroke="#64748B" stroke-dasharray="4 3" /><text x="18" y="151" fill="#94A3B8" font-size="12">📶 Chế Độ Offline [Future Scope]</text><text x="342" y="151" text-anchor="end" fill="#64748B" font-size="11">Chờ</text>
      <rect x="0" y="180" width="358" height="50" rx="8" fill="#7F1D1D" opacity="0.3" stroke="#EF4444" /><text x="18" y="211" fill="#FCA5A5" font-size="13">✕ Ngắt Kết Nối Với Server</text>
    </g>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// 8B. EMPTY STATES SUITE (QT-04: 3 Trạng thái rỗng chuẩn)
// ---------------------------------------------------------------------------
function renderEmptyStatesSuite() {
  return `${svgHeader(1440, 900, 'EMPTY-STATES: 3 Trạng thái rỗng')}
  <rect x="0" y="0" width="1440" height="900" fill="#090D16" />
  <rect x="40" y="40" width="1360" height="820" rx="16" fill="#0F172A" stroke="#1E293B" stroke-width="2" />
  <text x="72" y="84" fill="#FFF" font-size="24" font-weight="700">Bộ 3 Trạng Thái Rỗng (Empty States — Desktop &amp; Mobile)</text>
  <text x="72" y="110" fill="#94A3B8" font-size="14">Đặc tả giao diện khi kho trống, không có món phù hợp và danh sách đi chợ trống</text>

  <!-- Empty State 1: Tủ lạnh chưa có thực phẩm -->
  <g id="EmptyState_Fridge" transform="translate(72, 145)">
    <rect x="0" y="0" width="390" height="660" rx="28" fill="#090D16" stroke="#334155" stroke-width="2" filter="url(#shadow)" />
    <rect x="16" y="16" width="358" height="44" rx="10" fill="#1E293B" />
    <text x="32" y="43" fill="#FFF" font-size="14" font-weight="700">ES-01: MOB-01 / DSK-03 (Kho Trống)</text>

    <g transform="translate(24, 150)">
      <rect x="0" y="0" width="342" height="330" rx="16" fill="#1E293B" stroke="#334155" stroke-dasharray="6 4" />
      <circle cx="171" cy="78" r="36" fill="#0F172A" stroke="#0F766E" stroke-width="2" />
      <text x="171" y="90" text-anchor="middle" fill="#FFF" font-size="32">🧊</text>
      <text x="171" y="148" text-anchor="middle" fill="#F8FAFC" font-size="16" font-weight="700">Tủ lạnh chưa có thực phẩm</text>
      <text x="171" y="176" text-anchor="middle" fill="#94A3B8" font-size="12">Thêm thực phẩm đầu tiên để hệ thống</text>
      <text x="171" y="195" text-anchor="middle" fill="#94A3B8" font-size="12">bắt đầu xếp hạng FEFO &amp; cảnh báo hạn dùng.</text>
      <g cursor="pointer" transform="translate(51, 232)">
        <rect x="0" y="0" width="240" height="46" rx="10" fill="#0F766E" filter="url(#shadow)" />
        <text x="120" y="28" text-anchor="middle" fill="#FFF" font-size="14" font-weight="700">+ Nhập thực phẩm đầu tiên</text>
      </g>
    </g>
    <text x="195" y="540" text-anchor="middle" fill="#64748B" font-size="11">Kích hoạt khi GET /api/inventory trả về []</text>
  </g>

  <!-- Empty State 2: Không có món nào nấu được -->
  <g id="EmptyState_Recipes" transform="translate(525, 145)">
    <rect x="0" y="0" width="390" height="660" rx="28" fill="#090D16" stroke="#334155" stroke-width="2" filter="url(#shadow)" />
    <rect x="16" y="16" width="358" height="44" rx="10" fill="#1E293B" />
    <text x="32" y="43" fill="#FFF" font-size="14" font-weight="700">ES-02: MOB-04 / DSK-02 (Không Có Món)</text>

    <g transform="translate(24, 150)">
      <rect x="0" y="0" width="342" height="330" rx="16" fill="#1E293B" stroke="#334155" stroke-dasharray="6 4" />
      <circle cx="171" cy="78" r="36" fill="#0F172A" stroke="#F59E0B" stroke-width="2" />
      <text x="171" y="90" text-anchor="middle" fill="#FFF" font-size="32">🍳</text>
      <text x="171" y="148" text-anchor="middle" fill="#F8FAFC" font-size="16" font-weight="700">Không có món nào nấu được</text>
      <text x="171" y="176" text-anchor="middle" fill="#94A3B8" font-size="12">Nguyên liệu hiện có chưa khớp đủ</text>
      <text x="171" y="195" text-anchor="middle" fill="#94A3B8" font-size="12">công thức nấu ăn gia đình trong kho.</text>
      <g cursor="pointer" transform="translate(51, 232)">
        <rect x="0" y="0" width="240" height="46" rx="10" fill="#0F172A" stroke="#38BDF8" stroke-width="1.5" />
        <text x="120" y="28" text-anchor="middle" fill="#38BDF8" font-size="13" font-weight="700">Xem toàn bộ công thức &amp; đồ thiếu</text>
      </g>
    </g>
    <text x="195" y="540" text-anchor="middle" fill="#64748B" font-size="11">Kích hoạt khi GET /api/recipes/suggest rỗng</text>
  </g>

  <!-- Empty State 3: Danh sách đi chợ trống -->
  <g id="EmptyState_Shopping" transform="translate(978, 145)">
    <rect x="0" y="0" width="390" height="660" rx="28" fill="#090D16" stroke="#334155" stroke-width="2" filter="url(#shadow)" />
    <rect x="16" y="16" width="358" height="44" rx="10" fill="#1E293B" />
    <text x="32" y="43" fill="#FFF" font-size="14" font-weight="700">ES-03: MOB-05 / DSK-04 (Đi Chợ Trống)</text>

    <g transform="translate(24, 150)">
      <rect x="0" y="0" width="342" height="330" rx="16" fill="#1E293B" stroke="#10B981" stroke-dasharray="6 4" />
      <circle cx="171" cy="78" r="36" fill="#064E3B" stroke="#10B981" stroke-width="2" />
      <text x="171" y="90" text-anchor="middle" fill="#6EE7B7" font-size="30">🛒</text>
      <text x="171" y="148" text-anchor="middle" fill="#F8FAFC" font-size="16" font-weight="700">Danh sách đi chợ trống</text>
      <text x="171" y="176" text-anchor="middle" fill="#94A3B8" font-size="12">Tất cả mặt hàng thiết yếu đều đang</text>
      <text x="171" y="195" text-anchor="middle" fill="#94A3B8" font-size="12">cao hơn ngưỡng tồn tối thiểu (min_threshold).</text>
      <rect x="66" y="236" width="210" height="36" rx="18" fill="#064E3B" />
      <text x="171" y="259" text-anchor="middle" fill="#6EE7B7" font-size="12" font-weight="700">✓ Kho đang đầy đủ an toàn</text>
    </g>
    <text x="195" y="540" text-anchor="middle" fill="#64748B" font-size="11">Kích hoạt khi GET /api/shopping-list trả về []</text>
  </g>
  ${svgFooter()}`;
}

// ---------------------------------------------------------------------------
// 9. MASTER BOARD & EMBEDDING
// ---------------------------------------------------------------------------
function extractInnerSvg(svgString, prefix) {
  let inner = svgString
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<defs>[\s\S]*?<\/defs>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  if (prefix) {
    inner = inner.replace(/id="([^"]+)"/g, `id="${prefix}_$1"`);
  }
  return inner;
}

function renderMasterBoard(screens) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6400 4400" width="6400" height="4400" style="background:#090D16;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <defs>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#1E293B" stroke-width="1" />
    </pattern>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.25"/>
    </filter>
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F766E"/>
      <stop offset="100%" stop-color="#14B8A6"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
  </defs>
  <rect width="6400" height="4400" fill="url(#grid)" />

  <g transform="translate(100, 100)">
    <text x="0" y="60" fill="#FFF" font-size="48" font-weight="800">FIGMA MASTER BOARD — HỆ THỐNG QUẢN LÝ THỰC PHẨM GIA ĐÌNH &amp; FEFO</text>
    <text x="0" y="110" fill="#94A3B8" font-size="24">Đặc Tả Khung Dây Wireframe &amp; Giao Diện Dự Kiến Hoàn Chỉnh (Desktop Server + Mobile Client)</text>
  </g>

  <!-- Row 1: Desktop 1-4 -->
  <g transform="translate(100, 260)">
    <text x="0" y="0" fill="#38BDF8" font-size="28" font-weight="700">PHÂN HỆ 1: DESKTOP SERVER WORKBENCH (1440 × 900 PX)</text>
    <g transform="translate(0, 40) scale(0.95)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="18" font-weight="600">Frame 1: DSK-01 Bảng điều khiển Server</text>
      <rect x="0" y="0" width="1440" height="900" fill="#0F172A" rx="8" filter="url(#shadow)" />
      ${extractInnerSvg(screens.dsk01, 'dsk01')}
    </g>
    <g transform="translate(1480, 40) scale(0.95)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="18" font-weight="600">Frame 2: DSK-02 Đề xuất FEFO &amp; Món Ăn</text>
      <rect x="0" y="0" width="1440" height="900" fill="#0F172A" rx="8" filter="url(#shadow)" />
      ${extractInnerSvg(screens.dsk02, 'dsk02')}
    </g>
    <g transform="translate(2960, 40) scale(0.95)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="18" font-weight="600">Frame 3: DSK-03 Kho &amp; Drawer Chi Tiết</text>
      <rect x="0" y="0" width="1440" height="900" fill="#0F172A" rx="8" filter="url(#shadow)" />
      ${extractInnerSvg(screens.dsk03, 'dsk03')}
    </g>
    <g transform="translate(4440, 40) scale(0.95)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="18" font-weight="600">Frame 4: DSK-04 Trung Tâm Cảnh Báo</text>
      <rect x="0" y="0" width="1440" height="900" fill="#0F172A" rx="8" filter="url(#shadow)" />
      ${extractInnerSvg(screens.dsk04, 'dsk04')}
    </g>
  </g>

  <!-- Row 2: Desktop 5-7 + Modals -->
  <g transform="translate(100, 1300)">
    <g transform="translate(0, 40) scale(0.95)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="18" font-weight="600">Frame 5: DSK-05 Nhật Ký Kiểm Toán</text>
      <rect x="0" y="0" width="1440" height="900" fill="#0F172A" rx="8" filter="url(#shadow)" />
      ${extractInnerSvg(screens.dsk05, 'dsk05')}
    </g>
    <g transform="translate(1480, 40) scale(0.95)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="18" font-weight="600">Frame 6: DSK-06 Quản Lý Danh Mục</text>
      <rect x="0" y="0" width="1440" height="900" fill="#0F172A" rx="8" filter="url(#shadow)" />
      ${extractInnerSvg(screens.dsk06, 'dsk06')}
    </g>
    <g transform="translate(2960, 40) scale(0.95)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="18" font-weight="600">Frame 7: DSK-07 Cấu Hình Máy Chủ (:8080)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#0F172A" rx="8" filter="url(#shadow)" />
      ${extractInnerSvg(screens.dsk07, 'dsk07')}
    </g>
    <g transform="translate(4440, 40) scale(0.95)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="18" font-weight="600">Frame 8: DSK-MODALS Bộ 6 Hộp Thoại</text>
      <rect x="0" y="0" width="1440" height="900" fill="#0F172A" rx="8" filter="url(#shadow)" />
      ${extractInnerSvg(screens.dskModals, 'dskModals')}
    </g>
  </g>

  <!-- Row 3: Mobile 0-7 -->
  <g transform="translate(100, 2350)">
    <text x="0" y="0" fill="#10B981" font-size="28" font-weight="700">PHÂN HỆ 2: MOBILE CLIENT APPLICATION (390 × 844 PX — IPHONE 14 STANDARD)</text>
    <g transform="translate(0, 40)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="16" font-weight="600">MOB-00 Kết Nối</text>
      ${extractInnerSvg(screens.mob00, 'mob00')}
    </g>
    <g transform="translate(440, 40)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="16" font-weight="600">MOB-01 Trang Chủ</text>
      ${extractInnerSvg(screens.mob01, 'mob01')}
    </g>
    <g transform="translate(880, 40)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="16" font-weight="600">MOB-02 Tủ Lạnh</text>
      ${extractInnerSvg(screens.mob02, 'mob02')}
    </g>
    <g transform="translate(1320, 40)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="16" font-weight="600">MOB-03 Chi Tiết</text>
      ${extractInnerSvg(screens.mob03, 'mob03')}
    </g>
    <g transform="translate(1760, 40)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="16" font-weight="600">MOB-04 Gợi Ý Món</text>
      ${extractInnerSvg(screens.mob04, 'mob04')}
    </g>
    <g transform="translate(2200, 40)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="16" font-weight="600">MOB-05 Cảnh Báo</text>
      ${extractInnerSvg(screens.mob05, 'mob05')}
    </g>
    <g transform="translate(2640, 40)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="16" font-weight="600">MOB-06 Thêm &amp; AI [Future]</text>
      ${extractInnerSvg(screens.mob06, 'mob06')}
    </g>
    <g transform="translate(3080, 40)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="16" font-weight="600">MOB-07 Cài Đặt</text>
      ${extractInnerSvg(screens.mob07, 'mob07')}
    </g>
  </g>

  <!-- Row 4: Empty States Suite -->
  <g transform="translate(100, 3340)">
    <text x="0" y="0" fill="#A5B4FC" font-size="28" font-weight="700">PHÂN HỆ 3: TRẠNG THÁI RỖNG (EMPTY STATES SUITE — QT-04)</text>
    <g transform="translate(0, 40) scale(0.95)">
      <text x="0" y="-12" fill="#CBD5E1" font-size="18" font-weight="600">ES-01..ES-03: Kho Trống · Không Có Món Nấu Được · Đi Chợ Trống</text>
      <rect x="0" y="0" width="1440" height="900" fill="#0F172A" rx="8" filter="url(#shadow)" />
      ${extractInnerSvg(screens.emptyStates, 'emptyStates')}
    </g>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// 10. WIREFRAME GENERATION & TRANSFORMATION
// ---------------------------------------------------------------------------
function convertToWireframe(svgString) {
  let wf = svgString;

  // 1. Root style and background
  wf = wf.replace(/style="background:#0F172A;/g, 'style="background:#F8FAFC;');
  wf = wf.replace(/style="background:#090D16;/g, 'style="background:#F8FAFC;');

  // 2. Add grid pattern into defs
  const wfDefs = `
    <pattern id="wfGrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E2E8F0" stroke-width="0.8" />
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wfGrid)" opacity="0.6" />`;
  wf = wf.replace(/<\/defs>/, wfDefs);

  // 3. Desktop chrome replacements
  wf = wf.replace(/<rect width="1440" height="900" fill="#090D16" \/>/g, '<rect width="1440" height="900" fill="#F8FAFC" />');
  wf = wf.replace(/<rect x="0" y="0" width="260" height="900" fill="#0B132B"/g, '<rect x="0" y="0" width="260" height="900" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.5"');
  wf = wf.replace(/<rect x="260" y="0" width="1180" height="64" fill="#0F172A"/g, '<rect x="260" y="0" width="1180" height="64" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.5"');

  // 4. Mobile chrome replacements
  wf = wf.replace(/<rect x="0" y="0" width="390" height="844" rx="44" fill="#090D16" stroke="#1E293B" stroke-width="4" \/>/g, '<rect x="0" y="0" width="390" height="844" rx="44" fill="#FFFFFF" stroke="#334155" stroke-width="3" />');
  wf = wf.replace(/<rect x="0" y="44" width="390" height="52" fill="#0F172A" \/>/g, '<rect x="0" y="44" width="390" height="52" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />');
  wf = wf.replace(/<rect x="0" y="0" width="390" height="74" fill="#0F172A" \/>/g, '<rect x="0" y="0" width="390" height="74" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />');

  // 5. Container & card fills (no duplicate stroke attributes)
  wf = wf.replace(/fill="#1E293B"/g, 'fill="#FFFFFF"');
  wf = wf.replace(/fill="#0B132B"/g, 'fill="#FFFFFF"');
  wf = wf.replace(/fill="#0F172A"/g, 'fill="#F1F5F9"');
  wf = wf.replace(/fill="#090D16"/g, 'fill="#F8FAFC"');

  // 6. Action buttons and colored badges to wireframe neutral
  wf = wf.replace(/fill="url\(#primaryGrad\)"/g, 'fill="#F1F5F9"');
  wf = wf.replace(/fill="url\(#accentGrad\)"/g, 'fill="#E2E8F0"');
  wf = wf.replace(/fill="#0F766E"/g, 'fill="#E2E8F0"');
  wf = wf.replace(/fill="#10B981"/g, 'fill="#E2E8F0"');
  wf = wf.replace(/fill="#F59E0B"/g, 'fill="#E2E8F0"');
  wf = wf.replace(/fill="#064E3B"/g, 'fill="#E2E8F0"');
  wf = wf.replace(/fill="#78350F"/g, 'fill="#E2E8F0"');
  wf = wf.replace(/fill="#7F1D1D"/g, 'fill="#FEE2E2"');
  wf = wf.replace(/fill="#312E81"/g, 'fill="#E0E7FF"');

  // 7. Strokes
  wf = wf.replace(/stroke="#334155"/g, 'stroke="#94A3B8"');
  wf = wf.replace(/stroke="#1E293B"/g, 'stroke="#CBD5E1"');
  wf = wf.replace(/stroke="#38BDF8"/g, 'stroke="#0284C7"');
  wf = wf.replace(/stroke="#10B981"/g, 'stroke="#059669"');
  wf = wf.replace(/stroke="#F59E0B"/g, 'stroke="#D97706"');
  wf = wf.replace(/stroke="#818CF8"/g, 'stroke="#4338CA"');

  // 8. Text colors to deep dark & muted wireframe contrast
  wf = wf.replace(/fill="#FFFFFF"/g, 'fill="#0F172A"');
  wf = wf.replace(/fill="#FFF"/g, 'fill="#0F172A"');
  wf = wf.replace(/fill="#F8FAFC"/g, 'fill="#0F172A"');
  wf = wf.replace(/fill="#E2E8F0"/g, 'fill="#1E293B"');
  wf = wf.replace(/fill="#CBD5E1"/g, 'fill="#334155"');

  wf = wf.replace(/fill="#38BDF8"/g, 'fill="#0284C7"');
  wf = wf.replace(/fill="#6EE7B7"/g, 'fill="#059669"');
  wf = wf.replace(/fill="#34D399"/g, 'fill="#059669"');
  wf = wf.replace(/fill="#FCD34D"/g, 'fill="#B45309"');
  wf = wf.replace(/fill="#FBBF24"/g, 'fill="#B45309"');
  wf = wf.replace(/fill="#F87171"/g, 'fill="#DC2626"');
  wf = wf.replace(/fill="#FCA5A5"/g, 'fill="#DC2626"');
  wf = wf.replace(/fill="#E0E7FF"/g, 'fill="#312E81"');
  wf = wf.replace(/fill="#A5B4FC"/g, 'fill="#4338CA"');
  wf = wf.replace(/fill="#94A3B8"/g, 'fill="#64748B"');

  // 9. Frame & badge annotation
  wf = wf.replace(/<!-- Frame: ([^>]+) -->/, '<!-- Wireframe Frame: $1 [BLUEPRINT] -->');
  wf = wf.replace(/FoodManagement Server/g, '[WIREFRAME] FoodManagement Server');
  wf = wf.replace(/FoodManagement Client/g, '[WIREFRAME] FoodManagement Client');

  return wf;
}

function renderMasterBoardWireframes(wfScreens) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6400 4400" width="6400" height="4400" style="background:#F8FAFC;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <defs>
    <pattern id="wfMasterGrid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E2E8F0" stroke-width="1" />
    </pattern>
    <filter id="wfShadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#64748B" flood-opacity="0.15"/>
    </filter>
  </defs>
  <rect width="6400" height="4400" fill="url(#wfMasterGrid)" />

  <g transform="translate(100, 100)">
    <text x="0" y="60" fill="#0F172A" font-size="48" font-weight="800">FIGMA MASTER BOARD — BẢN VẼ PHÁC THẢO KHUNG DÂY WIREFRAME (BLUEPRINT)</text>
    <text x="0" y="110" fill="#64748B" font-size="24">Đặc Tả Cấu Trúc Khung Dây, Bố Cục Không Gian &amp; Phân Rã Chức Năng (Desktop Server + Mobile Client)</text>
  </g>

  <!-- Row 1: Desktop 1-4 -->
  <g transform="translate(100, 260)">
    <text x="0" y="0" fill="#0284C7" font-size="28" font-weight="700">PHÂN HỆ 1: DESKTOP SERVER WORKBENCH WIREFRAME (1440 × 900 PX)</text>
    <g transform="translate(0, 40) scale(0.95)">
      <text x="0" y="-12" fill="#334155" font-size="18" font-weight="600">WF-01: DSK-01 Bảng điều khiển Server (Khung dây)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#FFFFFF" rx="8" stroke="#94A3B8" stroke-width="1.5" filter="url(#wfShadow)" />
      ${extractInnerSvg(wfScreens.dsk01, 'wf_dsk01')}
    </g>
    <g transform="translate(1480, 40) scale(0.95)">
      <text x="0" y="-12" fill="#334155" font-size="18" font-weight="600">WF-02: DSK-02 Đề xuất FEFO &amp; Món Ăn (Khung dây)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#FFFFFF" rx="8" stroke="#94A3B8" stroke-width="1.5" filter="url(#wfShadow)" />
      ${extractInnerSvg(wfScreens.dsk02, 'wf_dsk02')}
    </g>
    <g transform="translate(2960, 40) scale(0.95)">
      <text x="0" y="-12" fill="#334155" font-size="18" font-weight="600">WF-03: DSK-03 Kho &amp; Drawer Chi Tiết (Khung dây)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#FFFFFF" rx="8" stroke="#94A3B8" stroke-width="1.5" filter="url(#wfShadow)" />
      ${extractInnerSvg(wfScreens.dsk03, 'wf_dsk03')}
    </g>
    <g transform="translate(4440, 40) scale(0.95)">
      <text x="0" y="-12" fill="#334155" font-size="18" font-weight="600">WF-04: DSK-04 Trung Tâm Cảnh Báo (Khung dây)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#FFFFFF" rx="8" stroke="#94A3B8" stroke-width="1.5" filter="url(#wfShadow)" />
      ${extractInnerSvg(wfScreens.dsk04, 'wf_dsk04')}
    </g>
  </g>

  <!-- Row 2: Desktop 5-7 + Modals -->
  <g transform="translate(100, 1300)">
    <g transform="translate(0, 40) scale(0.95)">
      <text x="0" y="-12" fill="#334155" font-size="18" font-weight="600">WF-05: DSK-05 Nhật Ký Kiểm Toán (Khung dây)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#FFFFFF" rx="8" stroke="#94A3B8" stroke-width="1.5" filter="url(#wfShadow)" />
      ${extractInnerSvg(wfScreens.dsk05, 'wf_dsk05')}
    </g>
    <g transform="translate(1480, 40) scale(0.95)">
      <text x="0" y="-12" fill="#334155" font-size="18" font-weight="600">WF-06: DSK-06 Quản Lý Danh Mục (Khung dây)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#FFFFFF" rx="8" stroke="#94A3B8" stroke-width="1.5" filter="url(#wfShadow)" />
      ${extractInnerSvg(wfScreens.dsk06, 'wf_dsk06')}
    </g>
    <g transform="translate(2960, 40) scale(0.95)">
      <text x="0" y="-12" fill="#334155" font-size="18" font-weight="600">WF-07: DSK-07 Cấu Hình Máy Chủ (:8080) (Khung dây)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#FFFFFF" rx="8" stroke="#94A3B8" stroke-width="1.5" filter="url(#wfShadow)" />
      ${extractInnerSvg(wfScreens.dsk07, 'wf_dsk07')}
    </g>
    <g transform="translate(4440, 40) scale(0.95)">
      <text x="0" y="-12" fill="#334155" font-size="18" font-weight="600">WF-08: DSK-MODALS Bộ 6 Hộp Thoại (Khung dây)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#FFFFFF" rx="8" stroke="#94A3B8" stroke-width="1.5" filter="url(#wfShadow)" />
      ${extractInnerSvg(wfScreens.dskModals, 'wf_dskModals')}
    </g>
  </g>

  <!-- Row 3: Mobile 0-7 -->
  <g transform="translate(100, 2350)">
    <text x="0" y="0" fill="#059669" font-size="28" font-weight="700">PHÂN HỆ 2: MOBILE CLIENT APPLICATION WIREFRAME (390 × 844 PX — IPHONE 14 STANDARD)</text>
    <g transform="translate(0, 40)">
      <text x="0" y="-12" fill="#334155" font-size="16" font-weight="600">WF-M00 Kết Nối</text>
      ${extractInnerSvg(wfScreens.mob00, 'wf_mob00')}
    </g>
    <g transform="translate(440, 40)">
      <text x="0" y="-12" fill="#334155" font-size="16" font-weight="600">WF-M01 Trang Chủ</text>
      ${extractInnerSvg(wfScreens.mob01, 'wf_mob01')}
    </g>
    <g transform="translate(880, 40)">
      <text x="0" y="-12" fill="#334155" font-size="16" font-weight="600">WF-M02 Tủ Lạnh</text>
      ${extractInnerSvg(wfScreens.mob02, 'wf_mob02')}
    </g>
    <g transform="translate(1320, 40)">
      <text x="0" y="-12" fill="#334155" font-size="16" font-weight="600">WF-M03 Chi Tiết</text>
      ${extractInnerSvg(wfScreens.mob03, 'wf_mob03')}
    </g>
    <g transform="translate(1760, 40)">
      <text x="0" y="-12" fill="#334155" font-size="16" font-weight="600">WF-M04 Gợi Ý Món</text>
      ${extractInnerSvg(wfScreens.mob04, 'wf_mob04')}
    </g>
    <g transform="translate(2200, 40)">
      <text x="0" y="-12" fill="#334155" font-size="16" font-weight="600">WF-M05 Cảnh Báo</text>
      ${extractInnerSvg(wfScreens.mob05, 'wf_mob05')}
    </g>
    <g transform="translate(2640, 40)">
      <text x="0" y="-12" fill="#334155" font-size="16" font-weight="600">WF-M06 Thêm &amp; AI [Future]</text>
      ${extractInnerSvg(wfScreens.mob06, 'wf_mob06')}
    </g>
    <g transform="translate(3080, 40)">
      <text x="0" y="-12" fill="#334155" font-size="16" font-weight="600">WF-M07 Cài Đặt</text>
      ${extractInnerSvg(wfScreens.mob07, 'wf_mob07')}
    </g>
  </g>

  <!-- Row 4: Empty States Suite -->
  <g transform="translate(100, 3340)">
    <text x="0" y="0" fill="#4338CA" font-size="28" font-weight="700">PHÂN HỆ 3: TRẠNG THÁI RỖNG WIREFRAME (EMPTY STATES — QT-04)</text>
    <g transform="translate(0, 40) scale(0.95)">
      <text x="0" y="-12" fill="#334155" font-size="18" font-weight="600">WF-EMPTY: Kho Trống · Không Có Món Nấu Được · Đi Chợ Trống (Khung dây)</text>
      <rect x="0" y="0" width="1440" height="900" fill="#FFFFFF" rx="8" stroke="#94A3B8" stroke-width="1.5" filter="url(#wfShadow)" />
      ${extractInnerSvg(wfScreens.emptyStates, 'wf_emptyStates')}
    </g>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Execution & Validation Loop
// ---------------------------------------------------------------------------
const screens = {
  dsk01: renderDSK01(),
  dsk02: renderDSK02(),
  dsk03: renderDSK03(),
  dsk04: renderDSK04(),
  dsk05: renderDSK05(),
  dsk06: renderDSK06(),
  dsk07: renderDSK07(),
  dskModals: renderDSKModals(),

  mob00: renderMOB00(),
  mob01: renderMOB01(),
  mob02: renderMOB02(),
  mob03: renderMOB03(),
  mob04: renderMOB04(),
  mob05: renderMOB05(),
  mob06: renderMOB06(),
  mob07: renderMOB07(),
  emptyStates: renderEmptyStatesSuite(),
};

screens.masterHifi = renderMasterBoard(screens);

// Generate Wireframe Counterparts
const wfScreens = {
  dsk01: convertToWireframe(screens.dsk01),
  dsk02: convertToWireframe(screens.dsk02),
  dsk03: convertToWireframe(screens.dsk03),
  dsk04: convertToWireframe(screens.dsk04),
  dsk05: convertToWireframe(screens.dsk05),
  dsk06: convertToWireframe(screens.dsk06),
  dsk07: convertToWireframe(screens.dsk07),
  dskModals: convertToWireframe(screens.dskModals),

  mob00: convertToWireframe(screens.mob00),
  mob01: convertToWireframe(screens.mob01),
  mob02: convertToWireframe(screens.mob02),
  mob03: convertToWireframe(screens.mob03),
  mob04: convertToWireframe(screens.mob04),
  mob05: convertToWireframe(screens.mob05),
  mob06: convertToWireframe(screens.mob06),
  mob07: convertToWireframe(screens.mob07),
  emptyStates: convertToWireframe(screens.emptyStates),
};

wfScreens.masterWf = renderMasterBoardWireframes(wfScreens);

const filesMap = {
  // Hi-Fi (Giao diện dự kiến)
  [path.join(desktopDir, 'DSK-01_Dashboard_Server.svg')]: screens.dsk01,
  [path.join(desktopDir, 'DSK-02_FEFO_Recommendations.svg')]: screens.dsk02,
  [path.join(desktopDir, 'DSK-03_Inventory_Management.svg')]: screens.dsk03,
  [path.join(desktopDir, 'DSK-04_Alerts_Center.svg')]: screens.dsk04,
  [path.join(desktopDir, 'DSK-05_Audit_Logs.svg')]: screens.dsk05,
  [path.join(desktopDir, 'DSK-06_Catalog_Management.svg')]: screens.dsk06,
  [path.join(desktopDir, 'DSK-07_Settings_Configuration.svg')]: screens.dsk07,
  [path.join(desktopDir, 'DSK-MODALS_Suite.svg')]: screens.dskModals,
  [path.join(desktopDir, 'EMPTY-STATES_Suite.svg')]: screens.emptyStates,

  [path.join(mobileDir, 'MOB-00_Connect_PIN.svg')]: screens.mob00,
  [path.join(mobileDir, 'MOB-01_Home_FEFO.svg')]: screens.mob01,
  [path.join(mobileDir, 'MOB-02_Inventory_Search_Filter.svg')]: screens.mob02,
  [path.join(mobileDir, 'MOB-03_Food_Detail_Actions.svg')]: screens.mob03,
  [path.join(mobileDir, 'MOB-04_Recipes_Cook.svg')]: screens.mob04,
  [path.join(mobileDir, 'MOB-05_Alerts_Shopping_List.svg')]: screens.mob05,
  [path.join(mobileDir, 'MOB-06_Add_Food_AI_Scan.svg')]: screens.mob06,
  [path.join(mobileDir, 'MOB-07_Stats_Logs_Settings.svg')]: screens.mob07,

  [path.join(masterDir, '00_FIGMA_MASTER_BOARD_ALL_SCREENS.svg')]: screens.masterHifi,

  // Wireframe (Khung dây phác thảo)
  [path.join(wfDesktopDir, 'WF-DSK-01_Dashboard_Server.svg')]: wfScreens.dsk01,
  [path.join(wfDesktopDir, 'WF-DSK-02_FEFO_Recommendations.svg')]: wfScreens.dsk02,
  [path.join(wfDesktopDir, 'WF-DSK-03_Inventory_Management.svg')]: wfScreens.dsk03,
  [path.join(wfDesktopDir, 'WF-DSK-04_Alerts_Center.svg')]: wfScreens.dsk04,
  [path.join(wfDesktopDir, 'WF-DSK-05_Audit_Logs.svg')]: wfScreens.dsk05,
  [path.join(wfDesktopDir, 'WF-DSK-06_Catalog_Management.svg')]: wfScreens.dsk06,
  [path.join(wfDesktopDir, 'WF-DSK-07_Settings_Configuration.svg')]: wfScreens.dsk07,
  [path.join(wfDesktopDir, 'WF-DSK-MODALS_Suite.svg')]: wfScreens.dskModals,
  [path.join(wfDesktopDir, 'WF-EMPTY-STATES_Suite.svg')]: wfScreens.emptyStates,

  [path.join(wfMobileDir, 'WF-MOB-00_Connect_PIN.svg')]: wfScreens.mob00,
  [path.join(wfMobileDir, 'WF-MOB-01_Home_FEFO.svg')]: wfScreens.mob01,
  [path.join(wfMobileDir, 'WF-MOB-02_Inventory_Search_Filter.svg')]: wfScreens.mob02,
  [path.join(wfMobileDir, 'WF-MOB-03_Food_Detail_Actions.svg')]: wfScreens.mob03,
  [path.join(wfMobileDir, 'WF-MOB-04_Recipes_Cook.svg')]: wfScreens.mob04,
  [path.join(wfMobileDir, 'WF-MOB-05_Alerts_Shopping_List.svg')]: wfScreens.mob05,
  [path.join(wfMobileDir, 'WF-MOB-06_Add_Food_AI_Scan.svg')]: wfScreens.mob06,
  [path.join(wfMobileDir, 'WF-MOB-07_Stats_Logs_Settings.svg')]: wfScreens.mob07,

  [path.join(wfMasterDir, '00_FIGMA_MASTER_BOARD_WIREFRAMES.svg')]: wfScreens.masterWf,
};

// Data bundle for client-side instant copy & preview without CORS
const allData = {
  // Hi-Fi Screens
  'master/00_FIGMA_MASTER_BOARD_ALL_SCREENS.svg': screens.masterHifi,
  'desktop/DSK-01_Dashboard_Server.svg': screens.dsk01,
  'desktop/DSK-02_FEFO_Recommendations.svg': screens.dsk02,
  'desktop/DSK-03_Inventory_Management.svg': screens.dsk03,
  'desktop/DSK-04_Alerts_Center.svg': screens.dsk04,
  'desktop/DSK-05_Audit_Logs.svg': screens.dsk05,
  'desktop/DSK-06_Catalog_Management.svg': screens.dsk06,
  'desktop/DSK-07_Settings_Configuration.svg': screens.dsk07,
  'desktop/DSK-MODALS_Suite.svg': screens.dskModals,
  'desktop/EMPTY-STATES_Suite.svg': screens.emptyStates,
  'mobile/MOB-00_Connect_PIN.svg': screens.mob00,
  'mobile/MOB-01_Home_FEFO.svg': screens.mob01,
  'mobile/MOB-02_Inventory_Search_Filter.svg': screens.mob02,
  'mobile/MOB-03_Food_Detail_Actions.svg': screens.mob03,
  'mobile/MOB-04_Recipes_Cook.svg': screens.mob04,
  'mobile/MOB-05_Alerts_Shopping_List.svg': screens.mob05,
  'mobile/MOB-06_Add_Food_AI_Scan.svg': screens.mob06,
  'mobile/MOB-07_Stats_Logs_Settings.svg': screens.mob07,

  // Wireframe Screens
  'wireframe/master/00_FIGMA_MASTER_BOARD_WIREFRAMES.svg': wfScreens.masterWf,
  'wireframe/desktop/WF-DSK-01_Dashboard_Server.svg': wfScreens.dsk01,
  'wireframe/desktop/WF-DSK-02_FEFO_Recommendations.svg': wfScreens.dsk02,
  'wireframe/desktop/WF-DSK-03_Inventory_Management.svg': wfScreens.dsk03,
  'wireframe/desktop/WF-DSK-04_Alerts_Center.svg': wfScreens.dsk04,
  'wireframe/desktop/WF-DSK-05_Audit_Logs.svg': wfScreens.dsk05,
  'wireframe/desktop/WF-DSK-06_Catalog_Management.svg': wfScreens.dsk06,
  'wireframe/desktop/WF-DSK-07_Settings_Configuration.svg': wfScreens.dsk07,
  'wireframe/desktop/WF-DSK-MODALS_Suite.svg': wfScreens.dskModals,
  'wireframe/desktop/WF-EMPTY-STATES_Suite.svg': wfScreens.emptyStates,
  'wireframe/mobile/WF-MOB-00_Connect_PIN.svg': wfScreens.mob00,
  'wireframe/mobile/WF-MOB-01_Home_FEFO.svg': wfScreens.mob01,
  'wireframe/mobile/WF-MOB-02_Inventory_Search_Filter.svg': wfScreens.mob02,
  'wireframe/mobile/WF-MOB-03_Food_Detail_Actions.svg': wfScreens.mob03,
  'wireframe/mobile/WF-MOB-04_Recipes_Cook.svg': wfScreens.mob04,
  'wireframe/mobile/WF-MOB-05_Alerts_Shopping_List.svg': wfScreens.mob05,
  'wireframe/mobile/WF-MOB-06_Add_Food_AI_Scan.svg': wfScreens.mob06,
  'wireframe/mobile/WF-MOB-07_Stats_Logs_Settings.svg': wfScreens.mob07,
};

fs.writeFileSync(path.join(__dirname, 'figma_screens_data.js'), 'window.FIGMA_SCREENS = ' + JSON.stringify(allData) + ';', 'utf8');

const dom = new JSDOM();
const parser = new dom.window.DOMParser();
let allPassed = true;

for (const [filePath, content] of Object.entries(filesMap)) {
  fs.writeFileSync(filePath, content, 'utf8');
  const fileName = path.basename(filePath);

  // Validate with DOMParser
  const doc = parser.parseFromString(content, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    console.error(`❌ XML ERROR in ${fileName}:`, parserError.textContent.split('\n')[0]);
    allPassed = false;
  } else {
    console.log(`✅ VALID XML: ${fileName}`);
  }
}

if (!allPassed) {
  console.error('\nOne or more SVG files failed XML validation!');
  process.exit(1);
} else {
  console.log(`\n🎉 ALL ${Object.keys(filesMap).length} SVG FILES (HIFI + WIREFRAME) PASSED STRICT XML VALIDATION (0 errors)!`);
}

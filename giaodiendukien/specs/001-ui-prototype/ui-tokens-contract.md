# UI Tokens & DataViz Visual Contract (Phase 1A)

**Design System**: Concept A — *Culinary Slate Workbench & Fresh Pantry* (`Operate` Mode)  
**Token Sources**:
- Desktop Server Workbench: [`tokens.css`](file:///d:/SourceCode/lập%20trình%20mạng/Quan_ly_Thuc_Pham/desktop-server/src/styles/tokens.css)
- Mobile Client Kitchen Pantry: [`tokens.css`](file:///d:/SourceCode/lập%20trình%20mạng/Quan_ly_Thuc_Pham/mobile-client/src/styles/tokens.css)

---

## 1. Visual World & Anti-Slop Invariants

1. **Brand Teal + Reserved Low-Stock Exception**: Brand identity runs strictly on **Botanical Deep Teal** (`#0F766E` / `#115E59`) paired with **Crisp Slate** (`#0F172A` / `#111827`) on Desktop and **Warm Pantry Stone** (`#FAF9F6`) on Mobile. Per the 4-level Color-Coded Lifecycle (`QT-03`), **Tím than** (`#312E81` on `#E0E7FF`, base `#4338CA`, dark chrome `#A5B4FC`) is reserved exclusively for **Cạn kho (`current_quantity <= min_threshold`)** and must never be used as a decorative brand color.
2. **Strict 2-Font System**:
   - `--font-sans`: `'Be Vietnam Pro'` (UI controls, headings, KPI hero figures, Vietnamese diacritics `ầ, ễ, ộ, ư`).
   - `--font-mono`: `'JetBrains Mono'` (`tabular-nums` strictly for `item_code`, dates, `IP:Port`, vertical table columns, and server packet trace logs).
   - **Rule (`dataviz`)**: Large standalone KPI numbers use `.kpi-num` (`proportional-nums`) — reserve `.mono-num` (`tabular-nums`) for aligned columns and axes.
3. **Operate-Mode Interaction Discipline**:
   - **In-flight feedback**: `0–100ms` none; `100ms–1s` disable control immediately and reveal `.btn-spinner` after `var(--spinner-defer-delay)` (`200ms`); `1–3s` apply `.btn-fixed-sm` / `.btn-fixed-md` / `.btn-fixed-lg` so swapping label ↔ spinner causes zero layout shift; `3s+` show explicit stage labels (`"Đang gửi tới Server…"` → `"Đang tính lại FEFO…"`).
   - **Quiet Back-Out Path**: `Hủy`, `Đóng`, `Giữ lại`, `Bỏ qua` MUST use `.btn-ghost` (neutral ink, transparent fill, no destructive red, no shortcut chip, no animated affordance).
   - **Destructive Actions Only**: `.btn-danger` (`#B91C1C`) is reserved exclusively for confirmed destructive steps (`Xác nhận thanh lý`, `Vứt hủy`, `Ngắt kết nối`).
   - **Honest UI Copy**: Never show `"Đã lưu"` or `"Đã dùng"` optimistically before receiving an ACK from `shared-sim` Server.

---

## 2. Platform Token Summary (Desktop vs. Mobile)

| Category | Desktop Server (`DSK-*`) | Mobile Client (`MOB-*`) |
|---|---|---|
| **Base Surface** | `--bg-canvas: #F4F6F8`, `--bg-surface: #FFFFFF` | `--bg-canvas: #FAF9F6`, `--bg-surface: #FFFFFF` |
| **Chrome / Nav Surface** | `--bg-titlebar: #0F172A`, `--bg-sidebar: #111827` | TopBar `#FFFFFF`, BottomNav `#FFFFFF` |
| **Primary Accent** | `--accent: #0F766E`, `--accent-hover: #115E59` | `--accent: #0F766E`, `--accent-hover: #115E59` |
| **Base Font Size** | `13px` (`--text-xs: 11px` .. `--text-2xl: 26px`) | `15px` (`--text-xs: 12px` .. `--text-2xl: 28px`, inputs `>=16px`) |
| **Key Dimensions** | `--sidebar-w: 228px`, `--drawer-w: 360px`, `--row-h: 34px`, `--titlebar-h: 36px`, `--statusbar-h: 26px` | `--bottomnav-h: 64px`, `--topbar-h: 56px`, `--touch-min: 44px`, `--fab-size: 56px`, `--phone-max-w: 430px` |
| **Safe Areas & Sheets** | `--z-drawer: 40`, `--z-tray: 70`, `--z-modal: 90` | `--safe-top`/`--safe-bottom`, `--sheet-radius: 20px`, `--stepper-h: 48px`, `--z-sheet: 80` |

---

## 3. WCAG 2.2 AA Contrast Verification Matrix

Computed deterministically via `dataviz/scripts/validate_palette.js` (`contrast()` & `apca()`):

| Pair (Foreground on Background) | Hex Pair | WCAG Ratio | APCA Lc | Grade |
|---|---|---|---|---|
| Primary CTA text on Accent | `#FFFFFF` on `#0F766E` | `5.47:1` | `82.2` | AA Text (`>= 4.5:1`) |
| Primary CTA hover | `#FFFFFF` on `#115E59` | `7.58:1` | `90.8` | AAA Text |
| Accent link on White / Daylight / Stone | `#0F766E` on `#FFFFFF` / `#F4F6F8` / `#FAF9F6` | `5.47` / `5.05` / `5.20` | `76.9` / `71.3` / `73.3` | AA Text |
| Desktop Primary Ink on White / Daylight | `#0F172A` on `#FFFFFF` / `#F4F6F8` | `17.85` / `16.48` | `104.6` / `99.0` | AAA Text |
| Desktop Muted Ink on White / Daylight | `#526071` on `#FFFFFF` / `#F4F6F8` | `6.42` / `5.93` | — | AA Text (safe at `11px–12px`) |
| Mobile Primary Ink on Stone / White | `#1C1917` on `#FAF9F6` / `#FFFFFF` | `16.61` / `17.49` | `100.7` / `104.3` | AAA Text |
| Mobile Muted Ink on Stone / White | `#57534E` on `#FAF9F6` / `#FFFFFF` | `7.25` / `7.63` | `82.9` / `86.5` | AAA Text |
| Sidebar Rail Text / Teal Highlight | `#F1F5F9` / `#5EEAD4` on `#111827` | `16.19` / `11.99` | `99.8` / `79.8` | AAA Text |
| Titlebar Live Indicator | `#34D399` on `#0F172A` | `9.29:1` | `65.1` | AAA Text |
| `.badge-fresh` | `#166534` on `#DCFCE7` | `6.49:1` | `77.9` | AA Text (`#15803D` base `4.57:1`) |
| `.badge-urgent` | `#92400E` on `#FEF3C7` | `6.37:1` | `76.6` | AA Text (`#B45309` base `4.51:1`) |
| `.badge-expired` | `#991B1B` on `#FEE2E2` | `6.80:1` | `73.7` | AA Text (`#B91C1C` base `5.30:1`) |
| `.badge-lowstock` (Cạn kho) | `#312E81` on `#E0E7FF` | `8.74:1` | `89.6` | AAA Text (`#4338CA` base `5.91:1`) |
| `.badge-info` | `#1D4ED8` on `#DBEAFE` | `5.49:1` | `68.8` | AA Text |
| `.badge-empty` | `#334155` on `#F1F5F9` | `9.45:1` | `87.7` | AAA Text |
| `.badge-cancelled` (Desktop / Mobile) | `#475569` on `#E2E8F0` / `#57534E` on `#E7E5E4` | `6.15` / `6.08` | `72.3` / `71.4` | AA Text |
| `.offline-banner` | `#92400E` on `#FEF3C7` | `6.37:1` | `76.6` | AA Text |

### 3.1. 4-Level Color-Coded Lifecycle (`QT-03`)

| Trạng thái | Điều kiện nghiệp vụ | Màu sắc & Token | Ký hiệu đi kèm |
|---|---|---|---|
| **An toàn** | Hạn dùng còn `> 3 ngày` | **Xanh lục** (`.badge-fresh`: `#166534` / `#DCFCE7`) | Badge an toàn |
| **Cận hạn (FEFO Cấp 1)** | Hạn dùng còn `1–3 ngày` | **Vàng cam** (`.badge-urgent`: `#92400E` / `#FEF3C7`) | Biểu tượng đồng hồ cát (`⏳`) |
| **Nguy cấp / Hết hạn** | Quá hạn hoặc hết hạn hôm nay (`<= 0 ngày`) | **Đỏ rực** (`.badge-expired`: `#991B1B` / `#FEE2E2`) | Cảnh báo tiêu hủy |
| **Cạn kho** | `current_quantity <= min_threshold` | **Tím than** (`.badge-lowstock`: `#312E81` / `#E0E7FF`) | Nhãn `Cạn kho / Cần mua thêm` |

---

## 4. Validated DataViz Contract (`dataviz` Skill)

### 4.1. Categorical Series Palette (Fixed Slot Order — Never Cycled)

| Slot | Token | Light Hex | Dark Console Hex | Assigned Domain Series |
|---|---|---|---|---|
| **1** | `--viz-series-1` | `#0D9488` | `#16A090` | **Nhập thêm (Stock In)** · **Trong tủ lạnh (In Fridge)** |
| **2** | `--viz-series-2` | `#D95F26` | `#DB612B` | **Xuất dùng (Consumed)** · **Ngoài tủ lạnh (Outside Fridge)** |
| **3** | `--viz-series-3` | `#1D68D8` | `#3E80E4` | **Điều chỉnh / Kiểm kê (Adjustment)** · **Net / Tồn kho** |
| **4** | `--viz-series-4` | `#C43737` | `#D44242` | **Vứt hủy / Thanh lý (Waste / Disposed)** |
| **5** | `--viz-series-5` | `#C58100` | `#C28800` | **Sắp ngưỡng / Dự phòng (Threshold Reference)** |
| **6** | `--viz-series-6` | `#106A3A` | `#117841` | **Tồn an toàn (Optimal Baseline)** |

### 4.2. Ordinal Teal Ramp (Sub-location Meter & Magnitude Tiers)

- `--viz-ordinal-1` → `--viz-ordinal-5`: `#42BFB0` → `#1BA595` → `#0D8A7D` → `#0E6E66` → `#0D524C`

### 4.3. `validate_palette.js` Verification Output

Executed against both `#FFFFFF` (Desktop/Mobile Card) and `#FAF9F6` (Mobile Stone), plus `#111827` (Dark Console):

```text
Light Categorical (6 slots) on #FFFFFF AND #FAF9F6:
  [PASS] Lightness band      all 6 inside L 0.43–0.77
  [PASS] Chroma floor        all 6 >= 0.10
  [PASS] CVD separation      worst adjacent #C58100↔#C43737 ΔE 11.5 (deutan) · tritan 14.1
  [PASS] Normal-vision floor worst adjacent #C58100↔#C43737 ΔE 17.0 (normal)
  [PASS] Contrast vs surface all 6 >= 3:1

Top-3 Slots (--pairs all) on #FFFFFF AND #FAF9F6:
  [PASS] CVD separation      worst all-pairs #D95F26↔#0D9488 ΔE 12.9 (protan)
  [PASS] Normal-vision floor worst all-pairs #1D68D8↔#0D9488 ΔE 19.7 (normal)

Ordinal 5-Step Teal Ramp (--ordinal) on #FFFFFF:
  [PASS] Lightness monotone  steps read light→dark
  [PASS] Adjacent ΔL         all gaps >= 0.06
  [PASS] Light-end contrast  #42BFB0 at 2.26:1 vs surface
  [PASS] Single hue          hue spread 3°

Dark Categorical (6 slots) on #111827:
  [PASS] Lightness band      all 6 inside L 0.48–0.67
  [PASS] Chroma floor        all 6 >= 0.10
  [PASS] CVD separation      worst adjacent #C28800↔#D44242 ΔE 8.8 (deutan) · tritan 14.0
  [PASS] Normal-vision floor worst adjacent #C28800↔#D44242 ΔE 17.0 (normal)
  [PASS] Contrast vs surface all 6 >= 3:1
```

### 4.4. SVG Chart Geometry & Component Guidelines (`frontend-engineer` #2 & #3)

1. **Chart 1 — Consumption & Stock In/Out Trend (`DSK-01`, `MOB-07`)**:
   - **Form**: Grouped column bar chart or multi-line trend (`<= 3` primary series: `Nhập thêm` `#0D9488`, `Xuất dùng` `#D95F26`, `Vứt hủy` `#C43737`). Single Y-axis ONLY (never dual-axis).
   - **Marks**:
     - Line mode: `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, markers `r="4"` (`8px` diameter) with `stroke="var(--viz-surface)" stroke-width="2"` (`2px` surface ring).
     - Bar mode: `width <= 24px`, `rx="4"` top corners / square baseline (`clipPath` or SVG path), `2px` horizontal surface gap between grouped bars.
     - Area wash (only if single-series): `fill-opacity="0.10"`.
   - **Axes & Grid**: Solid hairline `1px` horizontal gridlines (`stroke="var(--viz-gridline)"`, NEVER `stroke-dasharray`), axis baseline `stroke="var(--viz-axis)"`. Axis & legend text strictly wears `var(--text-primary)` / `var(--text-muted)` — NEVER the series color!
   - **SVG Sizing**:
     - Desktop `DSK-01`: `viewBox="0 0 640 240"` (plot `y: 16..196`, x-axis band `y: 196..232` so labels never clip or cause vertical scroll; `width="100%" height="auto"`).
     - Mobile `MOB-07`: `viewBox="0 0 340 190"` (compact height including x-axis band; label at most 4–5 tick dates cleanly).
   - **Interactivity & Accessibility**:
     - Vertical crosshair hairline snapping to nearest date + unified tooltip listing all series values (`textContent` safe, lead with `.mono-num` value, short `12px × 2px` colored line key).
     - Mandatory **Table View Toggle** (`[Biểu đồ | Bảng số liệu]`) inside chart header so every chart has a WCAG table twin.
     - Color follows entity (never recolors when user toggles a filter!).
2. **Chart 2 — Fridge vs. Outside Area Distribution (`DSK-01`, `MOB-07`)**:
   - **Form**: Horizontal stacked proportional bar (single row comparing `Trong tủ lạnh` `#0D9488` vs `Ngoài tủ lạnh` `#D95F26` with a `2px` white `#FFFFFF` surface gap between segments — NEVER a 2-slice pie/donut!) + horizontal sub-location breakdown bars (`<= 20px` bar thickness, `4px` rounded right cap, ordinal teal/terracotta steps or Slot 1/2).
   - **Direct Labels**: Place percentage/count inside bar ONLY if segment width `>= 56px`; otherwise move label to the right tip or legend/table view. Never use `overflow: hidden` that truncates digits.
   - **SVG Sizing**:
     - Desktop `DSK-01`: `viewBox="0 0 460 220"` (stacked overview bar `h=28px` + 4–6 sub-location bars + legend).
     - Mobile `MOB-07`: `viewBox="0 0 340 160"` (stacked overview bar + top sub-location meters).
3. **KPI Stat Tiles (`DSK-01`)**:
   - 4 cards (`Tổng lô đang quản lý`, `Cần dùng gấp (FEFO)`, `Sắp hết hạn / Quá hạn`, `Dưới ngưỡng tồn min`).
   - Value uses `.kpi-num` (`26px` desktop), signed delta/sublabel in `--text-muted` or status ink paired with directional icon (never color alone).

---

## 5. Shared CSS Component Class Contract

Both `desktop-server/src/styles/tokens.css` and `mobile-client/src/styles/tokens.css` export identical semantic class names so components stay consistent across platforms:

| Class Name | Purpose & Contract |
|---|---|
| `.mono-num` | Tabular monospace (`JetBrains Mono`, `tabular-nums`) for `item_code`, dates, `IP:Port`, quantity columns, packet logs |
| `.kpi-num` | Proportional sans figures for hero/KPI metrics |
| `.badge` + `.badge-fresh` \| `.badge-urgent` \| `.badge-expired` \| `.badge-lowstock` \| `.badge-empty` \| `.badge-cancelled` \| `.badge-info` | Pill badge (`11px` Desktop / `12px` Mobile). Always include icon (`⏳` for urgent 1–3d) or status dot + label |
| `.btn` + `.btn-primary` \| `.btn-secondary` \| `.btn-ghost` \| `.btn-danger` | Action buttons. `.btn-ghost` MUST be used for `Hủy` / `Đóng` / `Giữ lại` |
| `.btn-fixed-sm` \| `.btn-fixed-md` \| `.btn-fixed-lg` \| `.btn-fixed-full` | Fixed width locks to prevent layout shift during in-flight loading |
| `.btn-spinner` | `200ms` deferred loading spinner (`animation-delay: var(--spinner-defer-delay)`) |
| `.hairline-card` (Desktop) / `.pantry-card` (Mobile) | Base card surface containers |
| `.table-dense` / `.row-selected` (Desktop) | `34px` dense grid rows with distinct hover vs active selection states |
| `.touch-target`, `.offline-banner`, `.fab-btn`, `.bottom-sheet`, `.stepper-control`, `.stepper-btn` (Mobile) | `>= 44px` touch-safe primitives and safe-area-aware sheets |
| `.sr-only` | Visually hidden screen-reader labels (chart table twins, icon-only controls) |

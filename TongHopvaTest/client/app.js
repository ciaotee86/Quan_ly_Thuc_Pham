/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * PROTOTYPE GIAO DIỆN WEB TƯƠNG TÁC — HỆ THỐNG QUẢN LÝ THỰC PHẨM & ĐỀ XUẤT FEFO
 * Theo tài liệu phân rã chi tiết: Phân hệ 1 (FEFO 1.1 -> 1.6) & Phân hệ 2 (2.1 -> 2.8)
 * ═══════════════════════════════════════════════════════════════════════════════════
 */

// ── 1. GLOBAL STATE STORE ──
const state = {
  // Cài đặt hệ thống (Theo tài liệu phân hệ)
  systemSettings: {
    timezone: 'Asia/Ho_Chi_Minh (GMT+7)',
    systemDate: '2026-10-25', // Mốc ngày hiện tại giả lập
    warningDaysThreshold: 3,  // Ngưỡng cảnh báo sắp hết hạn (ngày)
    fefoTieBreaker: 'FIFO_IMPORT_DATE' // Cùng HSD thì ưu tiên ngày nhập trước (1.3.5)
  },

  // Điều hướng phân hệ chính (1: Đề xuất FEFO, 2: Quản lý thực phẩm)
  activeSubsystem: 1, 

  // Tab con trong Phân hệ 2
  activeSubsystem2Tab: 'inventory', // 'inventory' | 'categories' | 'audit_log'

  // Bộ lọc Phân hệ 1 (FEFO)
  fefoFilters: {
    locationGroup: 'ALL', // 'ALL' | 'FRIDGE' | 'ROOM'
    priority: 'ALL'       // 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'
  },

  // Bộ lọc & Tìm kiếm Phân hệ 2 (2.8)
  inventoryFilters: {
    keyword: '',
    categoryId: 'ALL',
    locationId: 'ALL',
    locationType: 'ALL',
    status: 'ALL',        // 'ALL' | 'ACTIVE' | 'LOW' | 'EMPTY'
    expiryStatus: 'ALL'   // 'ALL' | 'VALID' | 'WARNING' | 'EXPIRED'
  },

  // Danh mục loại thực phẩm (2.4)
  categories: [
    { id: 1, code: 'VEG', name: 'Rau củ quả', icon: '🥬', count: 4 },
    { id: 2, code: 'MEAT_FISH', name: 'Thịt & Thủy hải sản', icon: '🥩', count: 3 },
    { id: 3, code: 'DAIRY', name: 'Sữa & Chế phẩm sữa', icon: '🥛', count: 3 },
    { id: 4, code: 'SPICE', name: 'Gia vị & Dầu ăn', icon: '🧂', count: 2 },
    { id: 5, code: 'EGG_TOFU', name: 'Trứng & Đậu phụ', icon: '🥚', count: 2 },
    { id: 6, code: 'DRY_BAKERY', name: 'Đồ khô & Bánh mì', icon: '🍞', count: 2 }
  ],

  // Danh mục đơn vị tính (2.6)
  units: ['kg', 'g', 'hộp', 'quả', 'lít', 'ml', 'chai', 'gói', 'bó', 'khay'],

  // Danh mục vị trí bảo quản (2.7)
  storageLocations: [
    { id: 'FRIDGE_COOL', name: 'Ngăn mát tủ lạnh', area: 'FRIDGE', icon: '❄️' },
    { id: 'FRIDGE_FREEZE', name: 'Ngăn đông tủ lạnh', area: 'FRIDGE', icon: '🧊' },
    { id: 'FRIDGE_DOOR', name: 'Cánh tủ lạnh', area: 'FRIDGE', icon: '🚪' },
    { id: 'FRIDGE_VEG', name: 'Hộc rau củ tươi', area: 'FRIDGE', icon: '🥗' },
    { id: 'ROOM_PANTRY', name: 'Tủ bếp gia vị', area: 'ROOM', icon: '🏺' },
    { id: 'ROOM_SHELF', name: 'Kệ bếp thoáng mát', area: 'ROOM', icon: '🪑' },
    { id: 'ROOM_DRY', name: 'Kho đồ khô', area: 'ROOM', icon: '📦' }
  ],

  // Dữ liệu thực phẩm mẫu (Nguồn dữ liệu thống nhất cho cả 2 phân hệ)
  foods: [
    {
      id: 'TP001',
      code: 'TP001',
      name: 'Thịt bò bắp Úc',
      categoryId: 2,
      quantity: 0.8,
      unit: 'kg',
      minThreshold: 0.5,
      locationId: 'FRIDGE_COOL',
      importDate: '2026-10-22',
      expiryDate: '2026-10-26', // Còn 1 ngày -> Sắp hết hạn (Cao)
      brand: 'Vissan Meat',
      description: 'Thịt bò tươi nguyên miếng đã sơ chế sạch, đóng màng bọc thực phẩm.',
      isActive: true,
      image: '🥩'
    },
    {
      id: 'TP002',
      code: 'TP002',
      name: 'Sữa chua tiệt trùng nha đam',
      categoryId: 3,
      quantity: 4,
      unit: 'hộp',
      minThreshold: 2,
      locationId: 'FRIDGE_DOOR',
      importDate: '2026-10-18',
      expiryDate: '2026-10-27', // Còn 2 ngày -> Sắp hết hạn (Cao)
      brand: 'Vinamilk',
      description: 'Lốc 4 hộp sữa chua ăn có hạt nha đam.',
      isActive: true,
      image: '🥛'
    },
    {
      id: 'TP003',
      code: 'TP003',
      name: 'Rau cải ngọt canh',
      categoryId: 1,
      quantity: 0.5,
      unit: 'kg',
      minThreshold: 0.3,
      locationId: 'FRIDGE_VEG',
      importDate: '2026-10-23',
      expiryDate: '2026-10-27', // Còn 2 ngày -> Sắp hết hạn (Cao)
      brand: 'Nông trại Đà Lạt Green',
      description: 'Rau cải hữu cơ tươi rửa sơ.',
      isActive: true,
      image: '🥬'
    },
    {
      id: 'TP004',
      code: 'TP004',
      name: 'Cá hồi Na Uy phi lê',
      categoryId: 2,
      quantity: 0.6,
      unit: 'kg',
      minThreshold: 0.3,
      locationId: 'FRIDGE_FREEZE',
      importDate: '2026-10-20',
      expiryDate: '2026-10-29', // Còn 4 ngày -> Ưu tiên Trung bình
      brand: 'Salmar Seafood',
      description: 'Cá hồi cắt khúc không xương, cấp đông sâu.',
      isActive: true,
      image: '🐟'
    },
    {
      id: 'TP005',
      code: 'TP005',
      name: 'Cà chua bi organic',
      categoryId: 1,
      quantity: 0.4,
      unit: 'kg',
      minThreshold: 0.2,
      locationId: 'FRIDGE_VEG',
      importDate: '2026-10-21',
      expiryDate: '2026-10-30', // Còn 5 ngày -> Ưu tiên Trung bình
      brand: 'Ba Huân Farm',
      description: 'Cà chua bi đỏ ngọt, có thể ăn sống.',
      isActive: true,
      image: '🍅'
    },
    {
      id: 'TP006',
      code: 'TP006',
      name: 'Sữa tươi thanh trùng 100%',
      categoryId: 3,
      quantity: 1,
      unit: 'lít',
      minThreshold: 1,
      locationId: 'FRIDGE_DOOR',
      importDate: '2026-10-15',
      expiryDate: '2026-10-25', // Còn 0 ngày (Hết hạn HÔM NAY) -> Ưu tiên CỰC CAO
      brand: 'TH True Milk',
      description: 'Chai sữa thanh trùng nguyên chất, bảo quản lạnh nghiêm ngặt.',
      isActive: true,
      image: '🍶'
    },
    {
      id: 'TP007',
      code: 'TP007',
      name: 'Trứng gà ta thảo mộc',
      categoryId: 5,
      quantity: 10,
      unit: 'quả',
      minThreshold: 4,
      locationId: 'ROOM_SHELF',
      importDate: '2026-10-20',
      expiryDate: '2026-11-05', // Còn 11 ngày -> Ưu tiên Thấp
      brand: 'Dabaco',
      description: 'Vỉ 10 quả trứng gà ta sạch kiểm dịch.',
      isActive: true,
      image: '🥚'
    },
    {
      id: 'TP008',
      code: 'TP008',
      name: 'Bánh mì sandwich bơ sữa',
      categoryId: 6,
      quantity: 1,
      unit: 'gói',
      minThreshold: 1,
      locationId: 'ROOM_SHELF',
      importDate: '2026-10-22',
      expiryDate: '2026-10-28', // Còn 3 ngày -> Ưu tiên Trung bình
      brand: 'Kinh Đô Bakery',
      description: 'Túi 500g bánh mì lát mềm.',
      isActive: true,
      image: '🍞'
    },
    {
      id: 'TP009',
      code: 'TP009',
      name: 'Hành tây trắng',
      categoryId: 1,
      quantity: 1.2,
      unit: 'kg',
      minThreshold: 0.5,
      locationId: 'ROOM_SHELF',
      importDate: '2026-10-18',
      expiryDate: '2026-11-10', // Còn 16 ngày -> Ưu tiên Thấp
      brand: 'Chợ đầu mối',
      description: 'Hành củ khô, để nơi râm mát thông gió.',
      isActive: true,
      image: '🧅'
    },
    {
      id: 'TP010',
      code: 'TP010',
      name: 'Nấm đùi gà hữu cơ',
      categoryId: 1,
      quantity: 0.3,
      unit: 'kg',
      minThreshold: 0.2,
      locationId: 'FRIDGE_COOL',
      importDate: '2026-10-14',
      expiryDate: '2026-10-24', // ĐÃ QUÁ HẠN 1 NGÀY -> Loại khỏi FEFO theo 1.2.4.4
      brand: 'Biovegi',
      description: 'Khay 300g nấm tươi, cần kiểm tra tiêu hủy hoặc xử lý nhiệt nhanh.',
      isActive: true,
      image: '🍄'
    },
    {
      id: 'TP011',
      code: 'TP011',
      name: 'Nước tương đậu nành Maggi',
      categoryId: 4,
      quantity: 1,
      unit: 'chai',
      minThreshold: 1,
      locationId: 'ROOM_PANTRY',
      importDate: '2026-09-01',
      expiryDate: '2027-03-01', // Còn hơn 120 ngày -> Ưu tiên Thấp
      brand: 'Nestlé Maggi',
      description: 'Chai 700ml đậm đặc.',
      isActive: true,
      image: '🍾'
    },
    {
      id: 'TP012',
      code: 'TP012',
      name: 'Thịt nạc vai xay',
      categoryId: 2,
      quantity: 0, // ĐÃ HẾT SỐ LƯỢNG -> Loại theo 1.1.3
      unit: 'kg',
      minThreshold: 0.5,
      locationId: 'FRIDGE_FREEZE',
      importDate: '2026-10-10',
      expiryDate: '2026-11-15',
      brand: 'CP Pork',
      description: 'Đã dùng hết cho món canh hôm qua.',
      isActive: true,
      image: '🥓'
    },
    {
      id: 'TP013',
      code: 'TP013',
      name: 'Phô mai Cheddar lát',
      categoryId: 3,
      quantity: 12,
      unit: 'gói',
      minThreshold: 4,
      locationId: 'FRIDGE_COOL',
      importDate: '2026-10-10',
      expiryDate: '2026-11-02', // Còn 8 ngày -> Ưu tiên Thấp
      brand: 'Anchor Dairy',
      description: 'Gói 12 lát phô mai kẹp bánh mì.',
      isActive: true,
      image: '🧀'
    },
    {
      id: 'TP014',
      code: 'TP014',
      name: 'Ớt chuông đỏ Đà Lạt',
      categoryId: 1,
      quantity: 0.4,
      unit: 'kg',
      minThreshold: 0.2,
      locationId: 'FRIDGE_VEG',
      importDate: '2026-10-22',
      expiryDate: '2026-10-28', // Còn 3 ngày -> Ưu tiên Trung bình
      brand: 'DalatGAP',
      description: '2 trái ớt chuông đỏ mọng giàu vitamin C.',
      isActive: true,
      image: '🫑'
    },
    {
      id: 'TP015',
      code: 'TP015',
      name: 'Đậu phụ non Nhật Bản',
      categoryId: 5,
      quantity: 2,
      unit: 'hộp',
      minThreshold: 1,
      locationId: 'FRIDGE_COOL',
      importDate: '2026-10-22',
      expiryDate: '2026-10-27', // Còn 2 ngày -> Ưu tiên Cao
      brand: 'Ichiban',
      description: 'Đậu hũ non mềm mịn nấu canh hoặc chiên lướt ván.',
      isActive: true,
      image: '🧈'
    }
  ],

  // Bảng Nhật ký biến động thực phẩm (Audit Log - 2.5.5, 1.6.2, 2.2.5)
  inventoryLogs: [
    {
      id: 'LOG001',
      foodCode: 'TP006',
      foodName: 'Sữa tươi thanh trùng 100%',
      type: 'IMPORT',
      typeLabel: 'Nhập kho ban đầu',
      qtyBefore: 0,
      qtyChange: +1,
      qtyAfter: 1,
      unit: 'lít',
      reason: 'Nhập hàng mới mua từ siêu thị VinMart',
      timestamp: '2026-10-15 08:30:00'
    },
    {
      id: 'LOG002',
      foodCode: 'TP012',
      foodName: 'Thịt nạc vai xay',
      type: 'CONSUME',
      typeLabel: 'Xuất sử dụng',
      qtyBefore: 0.5,
      qtyChange: -0.5,
      qtyAfter: 0,
      unit: 'kg',
      reason: 'Nấu món canh thịt bằm bí đỏ ăn tối',
      timestamp: '2026-10-24 17:45:00'
    },
    {
      id: 'LOG003',
      foodCode: 'TP001',
      foodName: 'Thịt bò bắp Úc',
      type: 'IMPORT',
      typeLabel: 'Nhập kho ban đầu',
      qtyBefore: 0,
      qtyChange: +0.8,
      qtyAfter: 0.8,
      unit: 'kg',
      reason: 'Mua đồ ăn tuần mới',
      timestamp: '2026-10-22 09:15:00'
    }
  ],

  // Cơ sở tri thức gợi ý món ăn (1.5.5.5 - Xem món ăn phù hợp)
  recipes: [
    {
      id: 'REC01',
      title: 'Bò xào cải ngọt & tỏi ớt',
      primaryFoodCodes: ['TP001', 'TP003'],
      cookTime: '15 phút',
      difficulty: 'Dễ',
      description: 'Sử dụng thịt bò bắp mềm thái mỏng xào lửa lớn với rau cải ngọt giòn ngọt, nêm nước tương Maggi thơm lừng.',
      ingredients: [
        { name: 'Thịt bò bắp', code: 'TP001', inStock: true },
        { name: 'Rau cải ngọt', code: 'TP003', inStock: true },
        { name: 'Tỏi & Nước tương', code: 'TP011', inStock: true }
      ],
      steps: [
        'Thái thịt bò mỏng ướp với chút tỏi băm và 1 thìa nước tương Maggi.',
        'Rửa sạch cải ngọt, cắt khúc 4-5cm.',
        'Phi tỏi thơm, xào bò tái chín tới rồi trút ra đĩa riêng.',
        'Xào cải ngọt chín giòn, cho bò vào đảo đều 1 phút, tắt bếp rắc tiêu.'
      ]
    },
    {
      id: 'REC02',
      title: 'Cá hồi áp chảo sốt cà chua bi & ớt chuông',
      primaryFoodCodes: ['TP004', 'TP005', 'TP014'],
      cookTime: '20 phút',
      difficulty: 'Trung bình',
      description: 'Món ăn giàu Omega-3, da cá hồi giòn rụm kết hợp sốt chua ngọt thanh mát từ cà chua bi và ớt chuông.',
      ingredients: [
        { name: 'Cá hồi Na Uy phi lê', code: 'TP004', inStock: true },
        { name: 'Cà chua bi organic', code: 'TP005', inStock: true },
        { name: 'Ớt chuông đỏ', code: 'TP014', inStock: true }
      ],
      steps: [
        'Cá hồi thấm khô, rắc muối tiêu đều hai mặt.',
        'Áp chảo cá hồi mỗi mặt 3-4 phút đến khi vàng giòn.',
        'Bổ đôi cà chua bi, thái hạt lựu ớt chuông xào mềm làm sốt sánh.',
        'Rưới sốt lên miếng cá hồi nóng hổi và thưởng thức.'
      ]
    },
    {
      id: 'REC03',
      title: 'Canh đậu hũ non nấu cà chua & nấm',
      primaryFoodCodes: ['TP015', 'TP005'],
      cookTime: '12 phút',
      difficulty: 'Dễ',
      description: 'Món canh thanh đạm, giải nhiệt cực tốt, giải phóng nhanh đậu hũ non và cà chua bi sắp hết hạn.',
      ingredients: [
        { name: 'Đậu phụ non Nhật Bản', code: 'TP015', inStock: true },
        { name: 'Cà chua bi organic', code: 'TP005', inStock: true },
        { name: 'Hành lá, gia vị', inStock: true }
      ],
      steps: [
        'Xắt đậu phụ thành khối vuông vừa ăn.',
        'Cà chua xào mềm lấy màu, thêm 500ml nước đun sôi.',
        'Thả đậu phụ vào nấu sôi nhẹ 3 phút, nêm vừa khẩu vị.'
      ]
    },
    {
      id: 'REC04',
      title: 'Bánh mì kẹp trứng ốp la & Phô mai tan chảy',
      primaryFoodCodes: ['TP008', 'TP007', 'TP013'],
      cookTime: '8 phút',
      difficulty: 'Rất dễ',
      description: 'Bữa sáng hoàn hảo tận dụng bánh mì sandwich thơm mềm và trứng gà thảo mộc bổ dưỡng.',
      ingredients: [
        { name: 'Bánh mì sandwich', code: 'TP008', inStock: true },
        { name: 'Trứng gà ta', code: 'TP007', inStock: true },
        { name: 'Phô mai Cheddar', code: 'TP013', inStock: true }
      ],
      steps: [
        'Áp chảo nhẹ 2 lát bánh mì sandwich cho thơm giòn.',
        'Chiên ốp la 1 quả trứng gà lòng đào.',
        'Đặt lát phô mai Cheddar lên trứng nóng để phô mai chảy béo ngậy, kẹp vào giữa hai lát bánh.'
      ]
    }
  ]
};

// ── 2. BUSINESS LOGIC ENGINE (FEFO & INVENTORY RULES) ──

/**
 * Tính số ngày còn lại so với ngày hệ thống (1.2.3)
 */
function calculateDaysRemaining(expiryDateStr, systemDateStr = state.systemSettings.systemDate) {
  const exp = new Date(expiryDateStr);
  const sys = new Date(systemDateStr);
  // Đặt giờ về 0h00 để tính chuẩn xác ngày
  exp.setHours(0, 0, 0, 0);
  sys.setHours(0, 0, 0, 0);
  const diffTime = exp.getTime() - sys.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Phân cấp mức độ ưu tiên theo số ngày còn lại (1.4)
 */
function determinePriority(daysRemaining, threshold = state.systemSettings.warningDaysThreshold) {
  if (daysRemaining < 0) return { level: 'EXPIRED', label: 'Đã hết hạn', badgeClass: 'badge-priority-high', code: 0 };
  if (daysRemaining <= threshold) return { level: 'HIGH', label: 'Ưu tiên Cao', badgeClass: 'badge-priority-high', code: 1 };
  if (daysRemaining <= threshold + 3) return { level: 'MEDIUM', label: 'Ưu tiên TB', badgeClass: 'badge-priority-medium', code: 2 };
  return { level: 'LOW', label: 'Ưu tiên Thấp', badgeClass: 'badge-priority-low', code: 3 };
}

/**
 * Thuật toán sinh danh sách đề xuất FEFO (1.1 -> 1.5)
 */
function generateFEFORecommendations() {
  const sysDate = state.systemSettings.systemDate;
  const threshold = state.systemSettings.warningDaysThreshold;

  // 1.1 Xác định thực phẩm tồn kho: Chỉ lấy thực phẩm active và quantity > 0 (1.1.2.4 & 1.1.3)
  const availableFoods = state.foods.filter(f => f.isActive && f.quantity > 0);

  // 1.2 & 1.3: Tính hạn, lọc thực phẩm còn hạn hoặc trong ngày (1.2.4.4 loại thực phẩm hết hạn khỏi FEFO)
  const fefoCandidates = [];
  const expiredFoods = [];

  availableFoods.forEach(food => {
    const daysRemaining = calculateDaysRemaining(food.expiryDate, sysDate);
    const prio = determinePriority(daysRemaining, threshold);

    const enrichedFood = {
      ...food,
      daysRemaining,
      priority: prio,
      locationObj: state.storageLocations.find(l => l.id === food.locationId) || { name: food.locationId, area: 'UNKNOWN', icon: '📍' },
      categoryObj: state.categories.find(c => c.id === food.categoryId) || { name: 'Khác', icon: '📦' }
    };

    if (daysRemaining < 0) {
      // 1.2.4.5: Đưa thực phẩm hết hạn vào danh sách cần xử lý riêng
      expiredFoods.push(enrichedFood);
    } else {
      // 1.2.6: Xác định còn hạn -> Đưa vào danh sách FEFO
      // 1.5.2: Xác định lý do đề xuất
      let reason = '';
      if (daysRemaining === 0) {
        reason = 'Hết hạn HÔM NAY! Cần chế biến gấp để không lãng phí.';
      } else if (daysRemaining <= threshold) {
        reason = `Sắp hết hạn trong ${daysRemaining} ngày (≤ ngưỡng ${threshold} ngày).`;
      } else if (daysRemaining <= threshold + 3) {
        reason = `Hạn sử dụng còn ${daysRemaining} ngày. Nên lên kế hoạch nấu trong tuần.`;
      } else {
        reason = `Còn hạn an toàn (${daysRemaining} ngày). Phù hợp dự trữ hoặc món kèm.`;
      }
      enrichedFood.recommendationReason = reason;
      fefoCandidates.push(enrichedFood);
    }
  });

  // 1.3 Sắp xếp theo FEFO: Hạn gần nhất lên trước (1.3.3)
  // Nếu cùng hạn thì so sánh ngày nhập (1.3.5)
  fefoCandidates.sort((a, b) => {
    const expDiff = new Date(a.expiryDate) - new Date(b.expiryDate);
    if (expDiff !== 0) return expDiff;
    // Cùng HSD -> so sánh ngày nhập (FIFO tie-breaker)
    return new Date(a.importDate) - new Date(b.importDate);
  });

  // Áp dụng bộ lọc FEFO (nếu người dùng lọc theo vị trí hoặc mức ưu tiên)
  let filteredRecommendations = [...fefoCandidates];
  if (state.fefoFilters.locationGroup !== 'ALL') {
    filteredRecommendations = filteredRecommendations.filter(f => f.locationObj.area === state.fefoFilters.locationGroup);
  }
  if (state.fefoFilters.priority !== 'ALL') {
    filteredRecommendations = filteredRecommendations.filter(f => f.priority.level === state.fefoFilters.priority);
  }

  return {
    recommendations: filteredRecommendations,
    allCandidatesCount: fefoCandidates.length,
    expiredCount: expiredFoods.length,
    expiredFoods,
    highPriorityCount: fefoCandidates.filter(f => f.priority.level === 'HIGH').length
  };
}

/**
 * Lọc và tìm kiếm thực phẩm cho Phân hệ 2 (2.8)
 */
function getFilteredInventory() {
  const q = state.inventoryFilters.keyword.trim().toLowerCase();
  const catId = state.inventoryFilters.categoryId;
  const locId = state.inventoryFilters.locationId;
  const locType = state.inventoryFilters.locationType;
  const status = state.inventoryFilters.status;
  const expiryStatus = state.inventoryFilters.expiryStatus;
  const sysDate = state.systemSettings.systemDate;
  const threshold = state.systemSettings.warningDaysThreshold;

  return state.foods
    .filter(f => f.isActive) // Chỉ hiển thị thực phẩm chưa bị xóa mềm
    .map(f => {
      const daysRemaining = calculateDaysRemaining(f.expiryDate, sysDate);
      const prio = determinePriority(daysRemaining, threshold);
      const locObj = state.storageLocations.find(l => l.id === f.locationId) || { name: f.locationId, area: 'UNKNOWN', icon: '📍' };
      const catObj = state.categories.find(c => c.id === f.categoryId) || { name: 'Khác', icon: '📦' };
      
      // Trạng thái tồn kho
      let stockStatus = 'NORMAL';
      let stockStatusLabel = 'Đang sử dụng';
      let stockStatusClass = 'badge-status-active';

      if (f.quantity === 0) {
        stockStatus = 'EMPTY';
        stockStatusLabel = 'Đã hết';
        stockStatusClass = 'badge-status-empty';
      } else if (f.quantity <= f.minThreshold) {
        stockStatus = 'LOW';
        stockStatusLabel = 'Sắp hết (Dưới min)';
        stockStatusClass = 'badge-status-low';
      }

      return {
        ...f,
        daysRemaining,
        priority: prio,
        locationObj: locObj,
        categoryObj: catObj,
        stockStatus,
        stockStatusLabel,
        stockStatusClass
      };
    })
    .filter(item => {
      // 2.8.3 Tìm kiếm từ khóa (tên, mã, loại)
      if (q) {
        const matchName = item.name.toLowerCase().includes(q);
        const matchCode = item.code.toLowerCase().includes(q);
        const matchCat = item.categoryObj.name.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchCat) return false;
      }

      // 2.8.4 Lọc theo loại
      if (catId !== 'ALL' && String(item.categoryId) !== String(catId)) {
        return false;
      }

      // 2.8.5 Lọc theo vị trí
      if (locType !== 'ALL' && item.locationObj.area !== locType) {
        return false;
      }
      if (locId !== 'ALL' && item.locationId !== locId) {
        return false;
      }

      // 2.8.6 Lọc theo trạng thái số lượng
      if (status !== 'ALL') {
        if (status === 'EMPTY' && item.stockStatus !== 'EMPTY') return false;
        if (status === 'LOW' && item.stockStatus !== 'LOW') return false;
        if (status === 'ACTIVE' && item.quantity <= 0) return false;
      }

      // 2.8.7 Lọc theo hạn sử dụng
      if (expiryStatus !== 'ALL') {
        if (expiryStatus === 'EXPIRED' && item.daysRemaining >= 0) return false;
        if (expiryStatus === 'WARNING' && (item.daysRemaining < 0 || item.daysRemaining > threshold)) return false;
        if (expiryStatus === 'VALID' && item.daysRemaining <= threshold) return false;
      }

      return true;
    });
}

// ── 3. DOM RENDERING & VIEW UPDATES ──

function renderApp() {
  renderSystemControls();
  renderBreadcrumb();

  if (state.activeSubsystem === 1) {
    document.getElementById('subsystem-1-panel').style.display = 'block';
    document.getElementById('subsystem-2-panel').style.display = 'none';
    document.getElementById('tab-btn-subsystem-1').className = 'subsystem-tab-btn active-subsystem-1';
    document.getElementById('tab-btn-subsystem-2').className = 'subsystem-tab-btn';
    renderFEFOSubsystem();
  } else {
    document.getElementById('subsystem-1-panel').style.display = 'none';
    document.getElementById('subsystem-2-panel').style.display = 'block';
    document.getElementById('tab-btn-subsystem-1').className = 'subsystem-tab-btn';
    document.getElementById('tab-btn-subsystem-2').className = 'subsystem-tab-btn active-subsystem-2';
    renderInventorySubsystem();
  }
}

/**
 * Hiển thị thanh trạng thái hệ thống
 */
function renderSystemControls() {
  const fefoData = generateFEFORecommendations();
  document.getElementById('display-system-date').textContent = state.systemSettings.systemDate;
  document.getElementById('display-warning-threshold').textContent = state.systemSettings.warningDaysThreshold + ' ngày';
  document.getElementById('fefo-badge-count').textContent = fefoData.recommendations.length;
  
  const activeCount = state.foods.filter(f => f.isActive && f.quantity > 0).length;
  document.getElementById('inventory-badge-count').textContent = activeCount;
}

/**
 * Hiển thị Breadcrumb phân cấp
 */
function renderBreadcrumb() {
  const trail = document.getElementById('breadcrumb-trail');
  if (state.activeSubsystem === 1) {
    trail.innerHTML = `
      <span>Hệ thống Quản lý Thực phẩm</span>
      <span class="breadcrumb-separator">/</span>
      <span>Phân hệ 1: Đề xuất FEFO</span>
      <span class="breadcrumb-separator">/</span>
      <span class="active-node">1.5 Bảng Đề xuất Thực phẩm cần sử dụng trước</span>
    `;
  } else {
    let subName = '2.8 Danh sách Tồn kho & Tìm kiếm';
    if (state.activeSubsystem2Tab === 'categories') subName = '2.4 / 2.6 / 2.7 Quản lý Danh mục (Loại, Đơn vị, Vị trí)';
    if (state.activeSubsystem2Tab === 'audit_log') subName = '2.5.5 Nhật ký Biến động Thực phẩm (Audit Trail)';

    trail.innerHTML = `
      <span>Hệ thống Quản lý Thực phẩm</span>
      <span class="breadcrumb-separator">/</span>
      <span>Phân hệ 2: Quản lý Thực phẩm</span>
      <span class="breadcrumb-separator">/</span>
      <span class="active-node">${subName}</span>
    `;
  }
}

/**
 * RENDER PHÂN HỆ 1: ĐỀ XUẤT THỰC PHẨM CẦN SỬ DỤNG TRƯỚC (FEFO)
 */
function renderFEFOSubsystem() {
  const { recommendations, expiredFoods, highPriorityCount } = generateFEFORecommendations();
  const container = document.getElementById('fefo-cards-container');
  const emptyState = document.getElementById('fefo-empty-state');
  const expiredAlertBox = document.getElementById('fefo-expired-alert-box');

  // Cảnh báo thực phẩm hết hạn (1.2.4.5)
  if (expiredFoods.length > 0) {
    expiredAlertBox.style.display = 'block';
    expiredAlertBox.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 1.5rem;">⚠️</span>
          <div>
            <strong style="color: #991b1b; font-size: var(--text-sm);">1.2.4 Phát hiện ${expiredFoods.length} thực phẩm ĐÃ HẾT HẠN sử dụng!</strong>
            <p style="color: #b91c1c; font-size: var(--text-xs); margin-top: 2px;">
              Các món này đã bị loại khỏi danh sách FEFO (1.2.4.4) và loại khỏi đề xuất món ăn (1.6.5.4) để đảm bảo an toàn vệ sinh thực phẩm:
              <strong>${expiredFoods.map(e => `${e.name} (${e.code})`).join(', ')}</strong>.
            </p>
          </div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="handleQuickDisposeExpired()">
          🗑️ Xử lý / Hủy ngay
        </button>
      </div>
    `;
  } else {
    expiredAlertBox.style.display = 'none';
  }

  // Thống kê nhanh FEFO
  document.getElementById('fefo-stat-total').textContent = recommendations.length;
  document.getElementById('fefo-stat-high').textContent = highPriorityCount;
  document.getElementById('fefo-stat-medium').textContent = recommendations.filter(r => r.priority.level === 'MEDIUM').length;
  document.getElementById('fefo-stat-safe').textContent = recommendations.filter(r => r.priority.level === 'LOW').length;

  if (recommendations.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  // Render từng thẻ đề xuất FEFO (1.5.3 & 1.5.5)
  container.innerHTML = recommendations.map((item, index) => {
    let rankBorderClass = 'rank-low';
    let daysBadgeColor = '#16a34a';
    if (item.priority.level === 'HIGH') {
      rankBorderClass = 'rank-high';
      daysBadgeColor = '#dc2626';
    } else if (item.priority.level === 'MEDIUM') {
      rankBorderClass = 'rank-medium';
      daysBadgeColor = '#d97706';
    }

    return `
      <div class="fefo-card ${rankBorderClass}">
        <span class="fefo-rank-tag">Ưu tiên #${index + 1}</span>

        <div>
          <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-size: 2rem; background: var(--color-bg-muted); width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-md);">
                ${item.image || '🥗'}
              </span>
              <div>
                <h4 style="font-size: var(--text-base); margin-bottom: 2px;">${item.name}</h4>
                <div style="display: flex; align-items: center; gap: 0.5rem; font-size: var(--text-xs); color: var(--color-text-muted);">
                  <span>Mã: <strong>${item.code}</strong></span>
                  <span>•</span>
                  <span>${item.categoryObj.name}</span>
                </div>
              </div>
            </div>
            <span class="badge ${item.priority.badgeClass}">${item.priority.label}</span>
          </div>

          <!-- Thông số Hạn & Vị trí -->
          <div style="background: var(--color-bg-muted); padding: 0.65rem 0.85rem; border-radius: var(--radius-md); margin-bottom: 0.85rem; font-size: var(--text-xs); display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div>
              <span style="color: var(--color-text-muted);">Hạn sử dụng:</span>
              <div style="font-weight: var(--weight-bold);">${item.expiryDate}</div>
              <div style="color: ${daysBadgeColor}; font-weight: var(--weight-bold); margin-top: 2px;">
                ${item.daysRemaining === 0 ? '⚠️ Hết hạn hôm nay!' : `⏳ Còn ${item.daysRemaining} ngày`}
              </div>
            </div>
            <div>
              <span style="color: var(--color-text-muted);">Vị trí bảo quản:</span>
              <div style="font-weight: var(--weight-medium);">${item.locationObj.icon} ${item.locationObj.name}</div>
              <div style="color: var(--color-text-muted); margin-top: 2px;">
                Tồn: <strong>${item.quantity} ${item.unit}</strong>
              </div>
            </div>
          </div>

          <!-- Lý do đề xuất (1.5.2 & 1.5.3.6) -->
          <div style="margin-bottom: 1rem; font-size: var(--text-xs); line-height: 1.4; color: var(--color-text-main); background: #f0fdf4; border-left: 3px solid var(--color-primary); padding: 0.4rem 0.65rem; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
            <strong style="color: var(--color-primary-hover);">Lý do đề xuất:</strong> ${item.recommendationReason}
          </div>
        </div>

        <!-- Thao tác trực tiếp (1.5.5.5 Xem món ăn & 1.6.2 Ghi nhận sử dụng) -->
        <div style="display: flex; gap: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--color-border);">
          <button class="btn btn-sm btn-outline" style="flex: 1;" onclick="openRecipeSuggestionModal('${item.code}')">
            🍳 Gợi ý món ăn
          </button>
          <button class="btn btn-sm btn-primary" style="flex: 1;" onclick="openQuickConsumeModal('${item.id}')">
            🍴 Dùng thực phẩm
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * RENDER PHÂN HỆ 2: QUẢN LÝ THỰC PHẨM (CRUD & TỒN KHO)
 */
function renderInventorySubsystem() {
  const filteredFoods = getFilteredInventory();
  const tableBody = document.getElementById('inventory-table-body');
  const countBadge = document.getElementById('inventory-filtered-count');
  countBadge.textContent = `${filteredFoods.length} / ${state.foods.filter(f => f.isActive).length} thực phẩm`;

  if (filteredFoods.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">
          🔍 Không tìm thấy thực phẩm nào phù hợp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredFoods.map(item => {
    let daysColor = '#16a34a';
    let daysText = `Còn ${item.daysRemaining} ngày`;
    if (item.daysRemaining < 0) {
      daysColor = '#dc2626';
      daysText = `Quá hạn ${Math.abs(item.daysRemaining)} ngày`;
    } else if (item.daysRemaining <= state.systemSettings.warningDaysThreshold) {
      daysColor = '#dc2626';
      daysText = `Sắp hết (${item.daysRemaining} ngày)`;
    }

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span style="font-size: 1.5rem; background: var(--color-bg-muted); width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm);">
              ${item.image || '🥗'}
            </span>
            <div>
              <div style="font-weight: var(--weight-bold);">${item.name}</div>
              <div style="font-size: var(--text-xs); color: var(--color-text-muted); font-family: monospace;">${item.code}</div>
            </div>
          </div>
        </td>
        <td>
          <span style="font-size: var(--text-xs); font-weight: var(--weight-medium);">${item.categoryObj.icon} ${item.categoryObj.name}</span>
        </td>
        <td>
          <span class="badge ${item.locationObj.area === 'FRIDGE' ? 'badge-loc-fridge' : 'badge-loc-room'}">
            ${item.locationObj.icon} ${item.locationObj.name}
          </span>
        </td>
        <td>
          <div style="font-weight: var(--weight-bold); font-size: var(--text-sm);">
            ${item.quantity} <span style="font-weight: normal; color: var(--color-text-muted); font-size: var(--text-xs);">${item.unit}</span>
          </div>
          <span class="badge ${item.stockStatusClass}" style="margin-top: 3px;">${item.stockStatusLabel}</span>
        </td>
        <td>
          <div style="font-size: var(--text-xs); color: var(--color-text-muted);">Nhập: ${item.importDate}</div>
          <div style="font-weight: var(--weight-medium); font-size: var(--text-xs);">Hạn: ${item.expiryDate}</div>
          <div style="color: ${daysColor}; font-weight: var(--weight-bold); font-size: var(--text-xs); margin-top: 2px;">
            ${daysText}
          </div>
        </td>
        <td>
          <span class="badge ${item.priority.badgeClass}">${item.priority.label}</span>
        </td>
        <td>
          <!-- Thao tác tích hợp (2.8.2 Xem, 2.2 Sửa, 2.5 Biến động, 2.3 Xóa) -->
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <button class="btn btn-sm btn-outline" title="2.8.2 Xem chi tiết hồ sơ" onclick="openFoodDetailModal('${item.id}')">
              👁️
            </button>
            <button class="btn btn-sm btn-outline" title="2.2 Chỉnh sửa thông tin" onclick="openEditFoodModal('${item.id}')">
              ✏️
            </button>
            <button class="btn btn-sm btn-outline" title="2.5 Cập nhật / Kiểm kê số lượng" onclick="openQuantityAdjustModal('${item.id}')">
              ⚖️
            </button>
            <button class="btn btn-sm btn-danger" title="2.3 Xóa thực phẩm" onclick="openDeleteFoodModal('${item.id}')">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * RENDER TAB DANH MỤC TRONG PHÂN HỆ 2 (2.4, 2.6, 2.7)
 */
function renderCategoriesTab() {
  // Render Loại thực phẩm (2.4)
  const catList = document.getElementById('categories-list-render');
  catList.innerHTML = state.categories.map(c => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: 0.5rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 1.25rem;">${c.icon}</span>
        <div>
          <strong style="font-size: var(--text-sm);">${c.name}</strong>
          <span style="font-size: var(--text-xs); color: var(--color-text-muted); margin-left: 0.5rem;">Mã: ${c.code}</span>
        </div>
      </div>
      <span class="badge badge-status-active">Đang áp dụng</span>
    </div>
  `).join('');

  // Render Đơn vị tính (2.6)
  const unitList = document.getElementById('units-list-render');
  unitList.innerHTML = state.units.map(u => `
    <span class="badge" style="background: var(--color-bg-muted); font-size: var(--text-sm); padding: 0.35rem 0.75rem;">
      ${u}
    </span>
  `).join('');

  // Render Vị trí bảo quản (2.7)
  const locList = document.getElementById('locations-list-render');
  locList.innerHTML = state.storageLocations.map(l => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: 0.5rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 1.25rem;">${l.icon}</span>
        <div>
          <strong style="font-size: var(--text-sm);">${l.name}</strong>
          <span style="font-size: var(--text-xs); color: var(--color-text-muted); display: block;">
            Khu vực: ${l.area === 'FRIDGE' ? 'Trong tủ lạnh' : 'Ngoài tủ lạnh'}
          </span>
        </div>
      </div>
      <span class="badge ${l.area === 'FRIDGE' ? 'badge-loc-fridge' : 'badge-loc-room'}">
        ${l.area === 'FRIDGE' ? 'Tủ lạnh' : 'Nhiệt độ phòng'}
      </span>
    </div>
  `).join('');
}

/**
 * RENDER TAB NHẬT KÝ BIẾN ĐỘNG (AUDIT LOG - 2.5.5)
 */
function renderAuditLogTab() {
  const tableBody = document.getElementById('audit-log-table-body');
  if (state.inventoryLogs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 1.5rem; color: var(--color-text-muted);">Chưa có ghi nhận biến động nào.</td></tr>`;
    return;
  }

  tableBody.innerHTML = state.inventoryLogs.map(log => {
    let typeBadge = 'badge-status-active';
    let icon = '➕';
    if (log.type === 'CONSUME') {
      typeBadge = 'badge-priority-medium';
      icon = '🍴';
    } else if (log.type === 'ADJUST') {
      typeBadge = 'badge-status-low';
      icon = '⚖️';
    } else if (log.type === 'DELETE') {
      typeBadge = 'badge-priority-high';
      icon = '🗑️';
    }

    return `
      <tr>
        <td style="font-size: var(--text-xs); color: var(--color-text-muted); font-family: monospace;">${log.timestamp}</td>
        <td>
          <strong>${log.foodName}</strong>
          <span style="font-size: var(--text-xs); color: var(--color-text-muted); display: block;">${log.foodCode}</span>
        </td>
        <td>
          <span class="badge ${typeBadge}">${icon} ${log.typeLabel}</span>
        </td>
        <td>
          <div style="font-size: var(--text-xs);">
            Trước: <strong>${log.qtyBefore}</strong> → Sau: <strong>${log.qtyAfter}</strong> ${log.unit}
          </div>
          <div style="font-size: var(--text-xs); font-weight: var(--weight-bold); color: ${log.qtyChange > 0 ? '#16a34a' : '#dc2626'};">
            ${log.qtyChange > 0 ? `+${log.qtyChange}` : log.qtyChange} ${log.unit}
          </div>
        </td>
        <td style="font-size: var(--text-xs);">${log.reason}</td>
      </tr>
    `;
  }).join('');
}

// ── 4. POPUP & MODAL CONTROLLERS ──

/**
 * 2.1 Mở Modal Thêm Thực Phẩm Mới
 */
function openAddFoodModal() {
  // Populate dropdowns
  const catSelect = document.getElementById('add-food-category');
  catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

  const unitSelect = document.getElementById('add-food-unit');
  unitSelect.innerHTML = state.units.map(u => `<option value="${u}">${u}</option>`).join('');

  const locSelect = document.getElementById('add-food-location');
  locSelect.innerHTML = state.storageLocations.map(l => `<option value="${l.id}">${l.icon} ${l.name} (${l.area === 'FRIDGE' ? 'Trong tủ' : 'Ngoài tủ'})</option>`).join('');

  // Default dates
  document.getElementById('add-food-code').value = 'TP' + String(state.foods.length + 1).padStart(3, '0');
  document.getElementById('add-food-name').value = '';
  document.getElementById('add-food-quantity').value = '1';
  document.getElementById('add-food-min-threshold').value = '0.5';
  document.getElementById('add-food-import-date').value = state.systemSettings.systemDate;
  
  // Expiry date mặc định = ngày HT + 3 ngày
  const expDefault = new Date(state.systemSettings.systemDate);
  expDefault.setDate(expDefault.getDate() + 3);
  document.getElementById('add-food-expiry-date').value = expDefault.toISOString().split('T')[0];

  document.getElementById('add-food-brand').value = '';
  document.getElementById('add-food-desc').value = '';
  document.getElementById('add-food-error-msg').style.display = 'none';

  openModal('modal-add-food');
}

/**
 * 2.1.11 Lưu thực phẩm mới & Validate
 */
function handleSaveNewFood() {
  const code = document.getElementById('add-food-code').value.trim();
  const name = document.getElementById('add-food-name').value.trim();
  const categoryId = parseInt(document.getElementById('add-food-category').value);
  const quantity = parseFloat(document.getElementById('add-food-quantity').value);
  const unit = document.getElementById('add-food-unit').value;
  const locationId = document.getElementById('add-food-location').value;
  const importDate = document.getElementById('add-food-import-date').value;
  const expiryDate = document.getElementById('add-food-expiry-date').value;
  const minThreshold = parseFloat(document.getElementById('add-food-min-threshold').value) || 0;
  const brand = document.getElementById('add-food-brand').value.trim();
  const description = document.getElementById('add-food-desc').value.trim();
  const errorBox = document.getElementById('add-food-error-msg');

  // Validation
  if (!code || !name) {
    showError(errorBox, '2.1.9 Kiểm tra lỗi: Vui lòng nhập đầy đủ Mã thực phẩm và Tên thực phẩm.');
    return;
  }
  if (isNaN(quantity) || quantity <= 0) {
    showError(errorBox, '2.1.4.2 Kiểm tra số lượng: Số lượng nhập vào phải lớn hơn 0.');
    return;
  }
  if (expiryDate < importDate) {
    showError(errorBox, '2.1.8.2 Kiểm tra hạn dùng: Hạn sử dụng không được trước ngày nhập!');
    return;
  }

  // 2.1.10 Kiểm tra trùng lặp mã thực phẩm
  const duplicate = state.foods.find(f => f.isActive && f.code.toLowerCase() === code.toLowerCase());
  if (duplicate) {
    showError(errorBox, `2.1.10 Phát hiện trùng mã: Thực phẩm mang mã '${code}' đã tồn tại (${duplicate.name}).`);
    return;
  }

  // Tạo đối tượng thực phẩm mới
  const newFood = {
    id: code,
    code,
    name,
    categoryId,
    quantity,
    unit,
    minThreshold,
    locationId,
    importDate,
    expiryDate,
    brand: brand || 'Không rõ',
    description: description || 'Nhập thủ công từ form',
    isActive: true,
    image: getCategoryEmoji(categoryId)
  };

  state.foods.unshift(newFood);

  // Ghi nhận Audit Log ban đầu (2.1.11.3 & 2.5.5)
  state.inventoryLogs.unshift({
    id: 'LOG' + Date.now(),
    foodCode: newFood.code,
    foodName: newFood.name,
    type: 'IMPORT',
    typeLabel: 'Nhập mới',
    qtyBefore: 0,
    qtyChange: +newFood.quantity,
    qtyAfter: newFood.quantity,
    unit: newFood.unit,
    reason: 'Thêm mới thực phẩm vào kho',
    timestamp: formatCurrentTime()
  });

  closeModal('modal-add-food');
  showToast(`✅ [2.1 & 1.6.1] Đã thêm thành công thực phẩm: "${newFood.name}". Thuật toán FEFO đã tự động cập nhật!`, 'success');
  renderApp();
}

/**
 * Mô phỏng nhận diện hình ảnh AI (Output 7 trong tài liệu)
 */
function handleSimulateAIScan() {
  const sampleScans = [
    { name: 'Xà lách Romaine tươi', cat: 1, qty: 0.4, unit: 'kg', loc: 'FRIDGE_VEG', days: 2, brand: 'Dalat Hydroponics', image: '🥗' },
    { name: 'Thịt đùi gà phi lê', cat: 2, qty: 1.0, unit: 'kg', loc: 'FRIDGE_FREEZE', days: 5, brand: 'Ba Huân', image: '🍗' },
    { name: 'Sữa chua men sống Probi', cat: 3, qty: 5, unit: 'hộp', loc: 'FRIDGE_DOOR', days: 3, brand: 'Vinamilk', image: '🥛' }
  ];
  const chosen = sampleScans[Math.floor(Math.random() * sampleScans.length)];

  document.getElementById('add-food-name').value = chosen.name;
  document.getElementById('add-food-category').value = chosen.cat;
  document.getElementById('add-food-quantity').value = chosen.qty;
  document.getElementById('add-food-unit').value = chosen.unit;
  document.getElementById('add-food-location').value = chosen.loc;
  document.getElementById('add-food-brand').value = chosen.brand;
  document.getElementById('add-food-desc').value = 'Trích xuất tự động qua công nghệ AI Vision (Ảnh chụp nhãn thực phẩm).';

  const expDate = new Date(state.systemSettings.systemDate);
  expDate.setDate(expDate.getDate() + chosen.days);
  document.getElementById('add-food-expiry-date').value = expDate.toISOString().split('T')[0];

  showToast(`🤖 [AI Vision] Nhận diện thành công: "${chosen.name}"! Dữ liệu đã được điền sẵn vào form.`, 'info');
}

/**
 * 2.2 Mở Modal Sửa Thực Phẩm
 */
let currentEditingFoodId = null;
function openEditFoodModal(id) {
  const food = state.foods.find(f => f.id === id);
  if (!food) return;
  currentEditingFoodId = id;

  const catSelect = document.getElementById('edit-food-category');
  catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}" ${c.id === food.categoryId ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('');

  const unitSelect = document.getElementById('edit-food-unit');
  unitSelect.innerHTML = state.units.map(u => `<option value="${u}" ${u === food.unit ? 'selected' : ''}>${u}</option>`).join('');

  const locSelect = document.getElementById('edit-food-location');
  locSelect.innerHTML = state.storageLocations.map(l => `<option value="${l.id}" ${l.id === food.locationId ? 'selected' : ''}>${l.icon} ${l.name}</option>`).join('');

  document.getElementById('edit-food-code').value = food.code;
  document.getElementById('edit-food-name').value = food.name;
  document.getElementById('edit-food-quantity').value = food.quantity;
  document.getElementById('edit-food-min-threshold').value = food.minThreshold;
  document.getElementById('edit-food-import-date').value = food.importDate;
  document.getElementById('edit-food-expiry-date').value = food.expiryDate;
  document.getElementById('edit-food-brand').value = food.brand || '';
  document.getElementById('edit-food-desc').value = food.description || '';
  document.getElementById('edit-food-error-msg').style.display = 'none';

  openModal('modal-edit-food');
}

/**
 * 2.2.11 Lưu thay đổi thông tin thực phẩm
 */
function handleSaveEditedFood() {
  const food = state.foods.find(f => f.id === currentEditingFoodId);
  if (!food) return;

  const name = document.getElementById('edit-food-name').value.trim();
  const categoryId = parseInt(document.getElementById('edit-food-category').value);
  const quantity = parseFloat(document.getElementById('edit-food-quantity').value);
  const unit = document.getElementById('edit-food-unit').value;
  const locationId = document.getElementById('edit-food-location').value;
  const importDate = document.getElementById('edit-food-import-date').value;
  const expiryDate = document.getElementById('edit-food-expiry-date').value;
  const minThreshold = parseFloat(document.getElementById('edit-food-min-threshold').value) || 0;
  const brand = document.getElementById('edit-food-brand').value.trim();
  const description = document.getElementById('edit-food-desc').value.trim();
  const errorBox = document.getElementById('edit-food-error-msg');

  if (!name) {
    showError(errorBox, 'Tên thực phẩm không được để trống.');
    return;
  }
  if (isNaN(quantity) || quantity < 0) {
    showError(errorBox, 'Số lượng không hợp lệ.');
    return;
  }
  if (expiryDate < importDate) {
    showError(errorBox, 'Hạn sử dụng không được trước ngày nhập!');
    return;
  }

  // Ghi nhận biến động nếu thay đổi số lượng (2.2.5)
  if (food.quantity !== quantity) {
    const diff = quantity - food.quantity;
    state.inventoryLogs.unshift({
      id: 'LOG' + Date.now(),
      foodCode: food.code,
      foodName: food.name,
      type: 'ADJUST',
      typeLabel: 'Điều chỉnh khi sửa',
      qtyBefore: food.quantity,
      qtyChange: diff,
      qtyAfter: quantity,
      unit: unit,
      reason: `Sửa thông tin trực tiếp: ${diff > 0 ? 'Tăng thêm' : 'Giảm bớt'}`,
      timestamp: formatCurrentTime()
    });
  }

  // Cập nhật thuộc tính
  food.name = name;
  food.categoryId = categoryId;
  food.quantity = quantity;
  food.unit = unit;
  food.locationId = locationId;
  food.importDate = importDate;
  food.expiryDate = expiryDate;
  food.minThreshold = minThreshold;
  food.brand = brand;
  food.description = description;

  closeModal('modal-edit-food');
  showToast(`✏️ [2.2 & 1.6.3] Cập nhật thành công thực phẩm: "${food.name}". Đã tính lại số ngày còn lại và FEFO!`, 'success');
  renderApp();
}

/**
 * 2.5 Mở Modal Biến Động Số Lượng / Kiểm Kê Kho
 */
let currentAdjustFoodId = null;
function openQuantityAdjustModal(id) {
  const food = state.foods.find(f => f.id === id);
  if (!food) return;
  currentAdjustFoodId = id;

  document.getElementById('adjust-food-title').textContent = `${food.name} (${food.code})`;
  document.getElementById('adjust-food-current-qty').textContent = `${food.quantity} ${food.unit}`;
  document.getElementById('adjust-qty-input').value = '1';
  document.getElementById('adjust-action-type').value = 'CONSUME';
  document.getElementById('adjust-reason-input').value = '';
  document.getElementById('adjust-error-msg').style.display = 'none';

  updateAdjustPreview();
  openModal('modal-adjust-quantity');
}

function updateAdjustPreview() {
  const food = state.foods.find(f => f.id === currentAdjustFoodId);
  if (!food) return;
  const action = document.getElementById('adjust-action-type').value;
  const delta = parseFloat(document.getElementById('adjust-qty-input').value) || 0;
  let newQty = food.quantity;

  if (action === 'CONSUME') {
    newQty = food.quantity - delta;
  } else if (action === 'IMPORT') {
    newQty = food.quantity + delta;
  } else if (action === 'OVERWRITE') {
    newQty = delta;
  }

  const previewEl = document.getElementById('adjust-preview-result');
  previewEl.textContent = `${newQty.toFixed(2)} ${food.unit}`;
  if (newQty < 0) {
    previewEl.style.color = '#dc2626';
  } else {
    previewEl.style.color = '#16a34a';
  }
}

/**
 * 2.5.3 & 1.6.2 Thực hiện lưu biến động số lượng
 */
function handleSaveQuantityAdjust() {
  const food = state.foods.find(f => f.id === currentAdjustFoodId);
  if (!food) return;

  const action = document.getElementById('adjust-action-type').value;
  const delta = parseFloat(document.getElementById('adjust-qty-input').value);
  const reason = document.getElementById('adjust-reason-input').value.trim() || 'Điều chỉnh kiểm kê định kỳ';
  const errorBox = document.getElementById('adjust-error-msg');

  if (isNaN(delta) || delta <= 0) {
    showError(errorBox, 'Số lượng thay đổi phải lớn hơn 0.');
    return;
  }

  let finalQty = food.quantity;
  let actualDiff = 0;
  let logType = 'ADJUST';
  let logLabel = 'Kiểm kê';

  if (action === 'CONSUME') {
    if (delta > food.quantity) {
      showError(errorBox, `2.5.4 Lỗi: Số lượng xuất dùng (${delta} ${food.unit}) vượt quá số lượng tồn hiện có (${food.quantity} ${food.unit})!`);
      return;
    }
    finalQty = food.quantity - delta;
    actualDiff = -delta;
    logType = 'CONSUME';
    logLabel = 'Xuất sử dụng';
  } else if (action === 'IMPORT') {
    finalQty = food.quantity + delta;
    actualDiff = delta;
    logType = 'IMPORT';
    logLabel = 'Nhập thêm';
  } else if (action === 'OVERWRITE') {
    finalQty = delta;
    actualDiff = delta - food.quantity;
    logType = 'ADJUST';
    logLabel = 'Kiểm kê lại';
  }

  const prevQty = food.quantity;
  food.quantity = Math.max(0, parseFloat(finalQty.toFixed(2)));

  // Ghi nhận Audit Log (2.5.5)
  state.inventoryLogs.unshift({
    id: 'LOG' + Date.now(),
    foodCode: food.code,
    foodName: food.name,
    type: logType,
    typeLabel: logLabel,
    qtyBefore: prevQty,
    qtyChange: actualDiff,
    qtyAfter: food.quantity,
    unit: food.unit,
    reason: reason,
    timestamp: formatCurrentTime()
  });

  closeModal('modal-adjust-quantity');
  
  if (food.quantity === 0) {
    showToast(`⚠️ [2.5.6.2 & 1.6.4] Thực phẩm "${food.name}" đã HẾT HÀNG (tồn = 0). Đã tự động loại khỏi đề xuất FEFO!`, 'warning');
  } else {
    showToast(`⚖️ [2.5 & 1.6.2] Đã cập nhật tồn kho: "${food.name}" còn ${food.quantity} ${food.unit}.`, 'success');
  }
  renderApp();
}

/**
 * 1.6.2 Nút thao tác nhanh "Dùng thực phẩm" ngay trên thẻ FEFO
 */
function openQuickConsumeModal(id) {
  openQuantityAdjustModal(id);
  document.getElementById('adjust-action-type').value = 'CONSUME';
  document.getElementById('adjust-reason-input').value = 'Dùng theo đề xuất ưu tiên FEFO';
  updateAdjustPreview();
}

/**
 * 2.3 Mở Modal Xóa Thực Phẩm (Soft Delete)
 */
let currentDeleteFoodId = null;
function openDeleteFoodModal(id) {
  const food = state.foods.find(f => f.id === id);
  if (!food) return;
  currentDeleteFoodId = id;

  document.getElementById('delete-food-name').textContent = `${food.name} (Mã: ${food.code})`;
  document.getElementById('delete-food-qty-warning').textContent = `Số lượng tồn hiện tại: ${food.quantity} ${food.unit}. Thao tác này sẽ đưa thực phẩm vào trạng thái hủy và bảo toàn toàn vẹn lịch sử biến động.`;
  openModal('modal-delete-food');
}

function handleConfirmDeleteFood() {
  const food = state.foods.find(f => f.id === currentDeleteFoodId);
  if (!food) return;

  // 2.3.5 Thực hiện xóa mềm
  food.isActive = false;

  // 2.3.5.4 Bảo toàn lịch sử sử dụng
  state.inventoryLogs.unshift({
    id: 'LOG' + Date.now(),
    foodCode: food.code,
    foodName: food.name,
    type: 'DELETE',
    typeLabel: 'Hủy / Xóa',
    qtyBefore: food.quantity,
    qtyChange: -food.quantity,
    qtyAfter: 0,
    unit: food.unit,
    reason: 'Người dùng xác nhận xóa khỏi hệ thống',
    timestamp: formatCurrentTime()
  });

  closeModal('modal-delete-food');
  showToast(`🗑️ [2.3 & 1.6] Đã xóa "${food.name}". Lịch sử biến động được bảo toàn thành công trong Audit Log.`, 'info');
  renderApp();
}

/**
 * Xử lý hủy nhanh các thực phẩm đã hết hạn (1.2.4.5)
 */
function handleQuickDisposeExpired() {
  const expired = state.foods.filter(f => f.isActive && calculateDaysRemaining(f.expiryDate) < 0);
  if (expired.length === 0) return;

  expired.forEach(food => {
    food.isActive = false;
    state.inventoryLogs.unshift({
      id: 'LOG' + Date.now(),
      foodCode: food.code,
      foodName: food.name,
      type: 'DELETE',
      typeLabel: 'Hủy hết hạn',
      qtyBefore: food.quantity,
      qtyChange: -food.quantity,
      qtyAfter: 0,
      unit: food.unit,
      reason: 'Tiêu hủy do quá hạn sử dụng (FEFO Safe Guard)',
      timestamp: formatCurrentTime()
    });
  });

  showToast(`🛡️ [1.2.4 & 1.6.5] Đã tiêu hủy an toàn ${expired.length} thực phẩm quá hạn. Danh sách FEFO đã sạch!`, 'success');
  renderApp();
}

/**
 * 2.8.2 Mở Drawer / Modal Xem Chi Tiết Thực Phẩm
 */
function openFoodDetailModal(id) {
  const food = state.foods.find(f => f.id === id);
  if (!food) return;

  const daysRemaining = calculateDaysRemaining(food.expiryDate);
  const prio = determinePriority(daysRemaining);
  const loc = state.storageLocations.find(l => l.id === food.locationId) || { name: food.locationId, area: 'UNKNOWN' };
  const cat = state.categories.find(c => c.id === food.categoryId) || { name: 'Khác' };

  document.getElementById('detail-food-icon').textContent = food.image || '🥗';
  document.getElementById('detail-food-name').textContent = food.name;
  document.getElementById('detail-food-code').textContent = food.code;
  document.getElementById('detail-food-cat').textContent = cat.name;
  document.getElementById('detail-food-brand').textContent = food.brand || 'Chưa cập nhật';
  document.getElementById('detail-food-qty').textContent = `${food.quantity} ${food.unit}`;
  document.getElementById('detail-food-min').textContent = `${food.minThreshold} ${food.unit}`;
  document.getElementById('detail-food-location').textContent = `${loc.name} (${loc.area === 'FRIDGE' ? 'Trong tủ lạnh' : 'Ngoài tủ lạnh'})`;
  document.getElementById('detail-food-import').textContent = food.importDate;
  document.getElementById('detail-food-expiry').textContent = food.expiryDate;
  
  const statusEl = document.getElementById('detail-food-status');
  statusEl.className = `badge ${prio.badgeClass}`;
  statusEl.textContent = `${prio.label} (${daysRemaining >= 0 ? `Còn ${daysRemaining} ngày` : `Quá hạn ${Math.abs(daysRemaining)} ngày`})`;

  document.getElementById('detail-food-desc').textContent = food.description || 'Không có mô tả chi tiết.';

  // Trích xuất lịch sử biến động riêng của thực phẩm này
  const itemLogs = state.inventoryLogs.filter(l => l.foodCode === food.code);
  const logContainer = document.getElementById('detail-food-logs-container');
  if (itemLogs.length === 0) {
    logContainer.innerHTML = '<p style="color: var(--color-text-muted); font-size: var(--text-xs);">Chưa có lịch sử biến động nào.</p>';
  } else {
    logContainer.innerHTML = itemLogs.map(l => `
      <div style="font-size: var(--text-xs); padding: 0.35rem 0; border-bottom: 1px dashed var(--color-border); display: flex; justify-content: space-between;">
        <span><strong>${l.typeLabel}:</strong> ${l.reason} (${l.qtyChange > 0 ? `+${l.qtyChange}` : l.qtyChange} ${l.unit})</span>
        <span style="color: var(--color-text-muted);">${l.timestamp}</span>
      </div>
    `).join('');
  }

  openModal('modal-food-detail');
}

/**
 * 1.5.5.5 Mở Modal Gợi Ý Món Ăn Phù Hợp
 */
function openRecipeSuggestionModal(foodCode) {
  const food = state.foods.find(f => f.code === foodCode);
  const modalBody = document.getElementById('recipe-modal-body');
  document.getElementById('recipe-modal-title').textContent = `Món ăn gợi ý cho: ${food ? food.name : foodCode}`;

  // Tìm các món ăn có chứa thực phẩm này hoặc phù hợp
  const matchedRecipes = state.recipes.filter(r => r.primaryFoodCodes.includes(foodCode));

  if (matchedRecipes.length === 0) {
    modalBody.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <span style="font-size: 2.5rem;">🍲</span>
        <h4 style="margin: 0.5rem 0;">Gợi ý món ăn nhanh: "${food ? food.name : ''} xào tỏi hoặc nấu canh"</h4>
        <p style="color: var(--color-text-muted); font-size: var(--text-sm);">
          Bạn có thể kết hợp với các gia vị có sẵn trong tủ để chế biến ngay trong 10-15 phút nhằm giải phóng hạn sử dụng.
        </p>
      </div>
    `;
  } else {
    modalBody.innerHTML = matchedRecipes.map(r => `
      <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem; background: var(--color-bg-muted);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <h4 style="font-size: var(--text-base); color: var(--color-primary-hover);">🍲 ${r.title}</h4>
          <span style="font-size: var(--text-xs); color: var(--color-text-muted); background: white; padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border);">
            ⏱️ ${r.cookTime} • Độ khó: ${r.difficulty}
          </span>
        </div>
        <p style="font-size: var(--text-xs); color: var(--color-text-main); margin-bottom: 0.75rem;">${r.description}</p>
        
        <div style="background: white; padding: 0.75rem; border-radius: var(--radius-sm); margin-bottom: 0.5rem; font-size: var(--text-xs);">
          <strong>Nguyên liệu trong tủ:</strong>
          <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.35rem;">
            ${r.ingredients.map(ing => `
              <span class="badge ${ing.inStock ? 'badge-status-active' : 'badge-status-empty'}">
                ${ing.inStock ? '✓' : '✗'} ${ing.name}
              </span>
            `).join('')}
          </div>
        </div>

        <div style="font-size: var(--text-xs);">
          <strong>Các bước thực hiện nhanh:</strong>
          <ol style="padding-left: 1.25rem; margin-top: 0.25rem; color: var(--color-text-muted);">
            ${r.steps.map(s => `<li style="margin-bottom: 2px;">${s}</li>`).join('')}
          </ol>
        </div>
      </div>
    `).join('');
  }

  openModal('modal-recipe-suggestions');
}

/**
 * Mở modal quản lý danh mục (2.4, 2.6, 2.7)
 */
function openManageCategoriesModal() {
  renderCategoriesTab();
  openModal('modal-manage-categories');
}

function handleAddNewCategory() {
  const name = prompt('Nhập tên Loại thực phẩm mới (Ví dụ: Đồ đông lạnh, Trái cây nhiệt đới):');
  if (!name || !name.trim()) return;
  const icon = prompt('Nhập biểu tượng Emoji cho loại này (Ví dụ: 🍓, 🥟):') || '📦';
  const newCat = {
    id: state.categories.length + 1,
    code: 'CAT_' + Date.now().toString().slice(-4),
    name: name.trim(),
    icon: icon.trim(),
    count: 0
  };
  state.categories.push(newCat);
  showToast(`✅ [2.4.6] Đã thêm loại thực phẩm: "${newCat.name}". Bộ lọc đã được cập nhật!`, 'success');
  renderCategoriesTab();
  populateFilterDropdowns();
}

function handleAddNewUnit() {
  const unit = prompt('Nhập tên đơn vị tính mới (Ví dụ: gram, lạng, lon, cốc):');
  if (!unit || !unit.trim()) return;
  if (state.units.includes(unit.trim())) {
    alert('Đơn vị tính này đã tồn tại!');
    return;
  }
  state.units.push(unit.trim());
  showToast(`✅ [2.6.2] Đã thêm đơn vị tính: "${unit.trim()}".`, 'success');
  renderCategoriesTab();
}

function handleAddNewLocation() {
  const name = prompt('Nhập tên vị trí lưu trữ mới (Ví dụ: Tủ mát mini, Kệ phòng ăn):');
  if (!name || !name.trim()) return;
  const area = confirm('Vị trí này nằm TRONG TỦ LẠNH? (Bấm OK nếu trong tủ lạnh, Bấm Cancel nếu ngoài tủ lạnh)') ? 'FRIDGE' : 'ROOM';
  const newLoc = {
    id: 'LOC_' + Date.now().toString().slice(-4),
    name: name.trim(),
    area: area,
    icon: area === 'FRIDGE' ? '❄️' : '📦'
  };
  state.storageLocations.push(newLoc);
  showToast(`✅ [2.7.2] Đã thêm vị trí bảo quản mới: "${newLoc.name}".`, 'success');
  renderCategoriesTab();
  populateFilterDropdowns();
}

// ── 5. SYSTEM CONTROLS & TREE INSPECTOR ──

/**
 * Đổi ngày hệ thống giả lập để kiểm thử tính năng FEFO ngay lập tức (1.2.1)
 */
function handleAdjustSystemDate(days) {
  const d = new Date(state.systemSettings.systemDate);
  d.setDate(d.getDate() + days);
  state.systemSettings.systemDate = d.toISOString().split('T')[0];
  showToast(`📅 [1.2.1] Đồng bộ ngày hệ thống giả lập: ${state.systemSettings.systemDate}. Toàn bộ hạn sử dụng và đề xuất FEFO đã được tính lại!`, 'info');
  renderApp();
}

function handleSetCustomSystemDate() {
  const newDate = prompt('Nhập ngày hệ thống giả lập mới (Định dạng YYYY-MM-DD):', state.systemSettings.systemDate);
  if (!newDate) return;
  if (isNaN(new Date(newDate).getTime())) {
    alert('Ngày không hợp lệ! Vui lòng nhập định dạng YYYY-MM-DD');
    return;
  }
  state.systemSettings.systemDate = newDate;
  showToast(`📅 Đã cập nhật ngày hệ thống: ${newDate}`, 'info');
  renderApp();
}

function handleAdjustWarningDays() {
  const input = prompt('Nhập ngưỡng số ngày cảnh báo sắp hết hạn (Mặc định: 3 ngày):', state.systemSettings.warningDaysThreshold);
  if (!input) return;
  const val = parseInt(input);
  if (isNaN(val) || val < 1 || val > 30) {
    alert('Vui lòng nhập số ngày hợp lệ từ 1 đến 30.');
    return;
  }
  state.systemSettings.warningDaysThreshold = val;
  showToast(`⚙️ [1.2.5.1] Đã đổi ngưỡng cảnh báo thành: ${val} ngày. Mức ưu tiên FEFO đã tái phân loại!`, 'success');
  renderApp();
}

function toggleAlgorithmExplainModal() {
  openModal('modal-algorithm-explain');
}

function toggleTreeInspector(forceState) {
  const drawer = document.getElementById('tree-inspector-drawer');
  if (typeof forceState === 'boolean') {
    if (forceState) drawer.classList.add('open');
    else drawer.classList.remove('open');
  } else {
    drawer.classList.toggle('open');
  }
}

/**
 * Xử lý khi người dùng click vào một chức năng con trong Tree Inspector
 */
function handleJumpToFunction(funcCode, funcName) {
  toggleTreeInspector(false);

  // Điều hướng đúng phân hệ
  if (funcCode.startsWith('1.')) {
    state.activeSubsystem = 1;
    renderApp();

    if (funcCode.startsWith('1.5.5')) {
      showToast(`🎯 Điều hướng tới: [${funcCode}] ${funcName}`, 'info');
    } else if (funcCode.startsWith('1.6')) {
      showToast(`🎯 [${funcCode}] Thao tác cập nhật đề xuất tự động chạy khi bạn dùng nút "Dùng thực phẩm" hoặc thêm/sửa món!`, 'info');
    } else {
      showToast(`🎯 Đang hiển thị Phân hệ 1: [${funcCode}] ${funcName}`, 'info');
    }
  } else if (funcCode.startsWith('2.')) {
    state.activeSubsystem = 2;

    if (funcCode.startsWith('2.1')) {
      renderApp();
      openAddFoodModal();
      showToast(`🎯 Đang mở Biểu mẫu: [${funcCode}] ${funcName}`, 'info');
    } else if (funcCode.startsWith('2.4') || funcCode.startsWith('2.6') || funcCode.startsWith('2.7')) {
      renderApp();
      openManageCategoriesModal();
      showToast(`🎯 Đang mở Quản lý danh mục: [${funcCode}] ${funcName}`, 'info');
    } else if (funcCode.startsWith('2.5.5')) {
      renderApp();
      switchSubsystem2Tab('audit_log');
      showToast(`🎯 Đang hiển thị Bảng Nhật ký: [${funcCode}] ${funcName}`, 'info');
    } else {
      renderApp();
      switchSubsystem2Tab('inventory');
      showToast(`🎯 Đang hiển thị Bảng Kho: [${funcCode}] ${funcName}`, 'info');
    }
  }
}

function switchSubsystem(num) {
  state.activeSubsystem = num;
  renderApp();
}

function switchSubsystem2Tab(tabName) {
  state.activeSubsystem2Tab = tabName;
  document.getElementById('sub2-tab-inventory').className = tabName === 'inventory' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  document.getElementById('sub2-tab-categories').className = tabName === 'categories' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  document.getElementById('sub2-tab-audit').className = tabName === 'audit_log' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';

  document.getElementById('sub2-view-inventory').style.display = tabName === 'inventory' ? 'block' : 'none';
  document.getElementById('sub2-view-categories').style.display = tabName === 'categories' ? 'block' : 'none';
  document.getElementById('sub2-view-audit').style.display = tabName === 'audit_log' ? 'block' : 'none';

  if (tabName === 'categories') renderCategoriesTab();
  if (tabName === 'audit_log') renderAuditLogTab();
  if (tabName === 'inventory') renderInventorySubsystem();
  renderBreadcrumb();
}

// ── 6. UTILITIES & HELPERS ──

function populateFilterDropdowns() {
  // Populate Categories Filter
  const catSelect = document.getElementById('filter-category');
  catSelect.innerHTML = `<option value="ALL">Tất cả loại thực phẩm (2.8.4)</option>` +
    state.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

  // Populate Locations Filter
  const locSelect = document.getElementById('filter-location');
  locSelect.innerHTML = `<option value="ALL">Tất cả vị trí chi tiết (2.8.5)</option>` +
    state.storageLocations.map(l => `<option value="${l.id}">${l.icon} ${l.name}</option>`).join('');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function getCategoryEmoji(catId) {
  const found = state.categories.find(c => c.id === catId);
  return found ? found.icon : '🥗';
}

function formatCurrentTime() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${state.systemSettings.systemDate} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ── 7. EVENT LISTENERS INITIALIZATION ──

document.addEventListener('DOMContentLoaded', () => {
  populateFilterDropdowns();

  // Search input
  const searchInput = document.getElementById('inventory-search-input');
  searchInput.addEventListener('input', (e) => {
    state.inventoryFilters.keyword = e.target.value;
    renderInventorySubsystem();
  });

  // Filter Category
  document.getElementById('filter-category').addEventListener('change', (e) => {
    state.inventoryFilters.categoryId = e.target.value;
    renderInventorySubsystem();
  });

  // Filter Location Type
  document.getElementById('filter-location-type').addEventListener('change', (e) => {
    state.inventoryFilters.locationType = e.target.value;
    renderInventorySubsystem();
  });

  // Filter Location ID
  document.getElementById('filter-location').addEventListener('change', (e) => {
    state.inventoryFilters.locationId = e.target.value;
    renderInventorySubsystem();
  });

  // Filter Status
  document.getElementById('filter-status').addEventListener('change', (e) => {
    state.inventoryFilters.status = e.target.value;
    renderInventorySubsystem();
  });

  // Filter Expiry Status
  document.getElementById('filter-expiry-status').addEventListener('change', (e) => {
    state.inventoryFilters.expiryStatus = e.target.value;
    renderInventorySubsystem();
  });

  // FEFO Filters
  document.getElementById('fefo-filter-loc').addEventListener('change', (e) => {
    state.fefoFilters.locationGroup = e.target.value;
    renderFEFOSubsystem();
  });
  document.getElementById('fefo-filter-priority').addEventListener('change', (e) => {
    state.fefoFilters.priority = e.target.value;
    renderFEFOSubsystem();
  });

  // Quantity adjust input listener
  document.getElementById('adjust-qty-input').addEventListener('input', updateAdjustPreview);
  document.getElementById('adjust-action-type').addEventListener('change', updateAdjustPreview);

  // Close modals on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      toggleTreeInspector(false);
    }
  });

  // Close modals on overlay backdrop click
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
      }
    });
  });

  // Initial render
  renderApp();
  initRealtimeEvents();
});


// ── REALTIME EVENT BROADCASTER LISTENER (PHƯƠNG ÁN 1 TẦNG MẠNG) ──
function initRealtimeEvents() {
  if (!window.EventSource) return;

  const eventBadge = document.createElement('div');
  eventBadge.id = 'realtime-indicator';
  eventBadge.style.cssText = 'position:fixed;bottom:16px;right:16px;padding:8px 16px;border-radius:20px;font-size:12px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:all 0.3s;background:#2e7d32;color:#fff;display:flex;align-items:center;gap:6px;';
  eventBadge.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#a5d6a7;"></span> Socket Realtime: Đang kết nối...';
  document.body.appendChild(eventBadge);

  try {
    const es = new EventSource('/api/events');

    es.addEventListener('CONNECTED', (e) => {
      console.log('Realtime SSE Connected:', e.data);
      eventBadge.style.background = '#2e7d32';
      eventBadge.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#81c784;"></span> Socket Realtime: Trực tuyến (Port 8080)';
    });

    es.addEventListener('INVENTORY_CHANGED', (e) => {
      const data = JSON.parse(e.data);
      console.log('Realtime Event INVENTORY_CHANGED:', data);
      showRealtimeToast(`🔔 Cập nhật kho thời gian thực: [${data.action}]`);
      syncLiveInventory();
    });

    es.addEventListener('DATE_CHANGED', (e) => {
      const data = JSON.parse(e.data);
      console.log('Realtime Event DATE_CHANGED:', data);
      showRealtimeToast(`📅 Máy chủ đã đổi ngày: ${data.simulation_date}`);
      syncLiveInventory();
    });

    es.onerror = () => {
      eventBadge.style.background = '#616161';
      eventBadge.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#bdbdbd;"></span> Chế độ Offline';
    };
  } catch (err) {
    console.warn('Realtime event stream not available:', err);
  }
}

function showRealtimeToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#1565c0;color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,0.25);z-index:10000;font-size:14px;font-weight:500;transition:opacity 0.5s;';
  toast.innerText = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

async function syncLiveInventory() {
  try {
    const res = await fetch('/api/inventory');
    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.data || []);
      if (items.length > 0) {
        state.foodItems = items.map(it => ({
          id: it.item_id,
          code: it.food_code || `TP${it.item_id}`,
          name: it.food_name,
          categoryId: it.category_id || 1,
          quantity: it.current_quantity,
          unit: it.unit_name,
          minThreshold: it.min_threshold || 1,
          locationId: it.location_id,
          locationName: it.location_name,
          importDate: it.import_date,
          expiryDate: it.expiration_date,
          daysLeft: it.days_left,
          daysRemaining: it.days_left,
          status: it.status,
          isActive: (it.status === 'ACTIVE' || it.status === 'Đang sử dụng'),
          image: '🍲'
        }));
        renderApp();
      }
    }
  } catch (e) {
    console.debug('Live sync fallback');
  }
}


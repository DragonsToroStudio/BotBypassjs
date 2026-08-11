// ============================================
// BOTBYPASS API - FIXED (Không dùng database)
// ============================================

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============ STORAGE TRONG BỘ NHỚ (RAM) ============
// Dữ liệu sẽ mất khi server restart, nhưng tạm thời dùng được
const stockStorage = {};
let requestLogs = [];

// ============ HÀM TIỆN ÍCH ============
const getTimestamp = () => new Date().toISOString();

const log = (message, type = 'INFO') => {
    const prefix = {
        INFO: '📘',
        SUCCESS: '✅',
        WARNING: '⚠️',
        ERROR: '❌',
        DEBUG: '🔍'
    };
    console.log(`[${getTimestamp()}] ${prefix[type] || '📘'} ${message}`);
};

// ============ TRANG CHỦ ============
app.get('/', (req, res) => {
    res.json({
        name: '🚀 BotBypass API',
        version: '2.0.0',
        status: '🟢 Online',
        storage: 'In-Memory (RAM)',
        total_items: Object.keys(stockStorage).length,
        endpoints: {
            'POST /api/update-stock': 'Gửi cập nhật stock (chỉ lưu khi > 0)',
            'GET /api/stock': 'Lấy tất cả stock (>0)',
            'GET /api/stock/:shop': 'Lấy stock theo shop',
            'GET /api/stock/:shop/:item': 'Lấy stock của 1 item',
            'DELETE /api/stock/:shop/:item': 'Xóa item',
            'GET /api/dashboard': 'Thống kê',
            'GET /api/logs': 'Xem log gần đây',
            'DELETE /api/reset': 'Reset toàn bộ (dev)',
            'GET /health': 'Health check'
        },
        example: {
            'POST /api/update-stock': {
                method: 'POST',
                body: {
                    shop: 'SeedShop',
                    item: 'Carrot',
                    stock: 15
                }
            }
        }
    });
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: getTimestamp(),
        uptime: process.uptime(),
        storage_size: Object.keys(stockStorage).length,
        memory_usage: process.memoryUsage()
    });
});

// ============ LOGS ============
app.get('/api/logs', (req, res) => {
    res.json({
        success: true,
        count: requestLogs.length,
        logs: requestLogs.slice(-50) // 50 log gần nhất
    });
});

// ============ API ENDPOINTS ============

// 1. NHẬN DỮ LIỆU TỪ ROBLOX
app.post('/api/update-stock', (req, res) => {
    const { shop, item, stock } = req.body;
    
    // Validate
    if (!shop || !item || stock === undefined) {
        const error = 'Thiếu tham số: shop, item, stock là bắt buộc';
        log(error, 'ERROR');
        return res.status(400).json({ success: false, error });
    }
    
    log(`📥 Nhận: ${shop} | ${item} = ${stock}`, 'INFO');
    
    // Lưu log
    requestLogs.push({
        type: 'update',
        shop,
        item,
        stock,
        timestamp: getTimestamp()
    });
    if (requestLogs.length > 100) requestLogs.shift();
    
    // ❌ BỎ QUA NẾU stock <= 0
    if (stock <= 0) {
        log(`⛔ Bỏ qua ${item} vì stock = ${stock}`, 'WARNING');
        return res.json({
            success: false,
            message: `⛔ Bỏ qua ${item} vì stock = ${stock} (không lưu)`
        });
    }
    
    // ✅ LƯU VÀO RAM NẾU stock > 0
    const key = `${shop}_${item}`;
    stockStorage[key] = {
        shop,
        item,
        stock,
        last_updated: getTimestamp()
    };
    
    log(`✅ Đã lưu: ${shop} | ${item} = ${stock}`, 'SUCCESS');
    res.json({
        success: true,
        message: `✅ Đã cập nhật ${item} = ${stock}`,
        data: { shop, item, stock, timestamp: getTimestamp() }
    });
});

// 2. LẤY TẤT CẢ STOCK
app.get('/api/stock', (req, res) => {
    try {
        const data = Object.values(stockStorage).filter(item => item.stock > 0);
        log(`📤 Lấy danh sách: ${data.length} items`, 'DEBUG');
        res.json({
            success: true,
            count: data.length,
            data: data.sort((a, b) => a.shop.localeCompare(b.shop) || a.item.localeCompare(b.item))
        });
    } catch (err) {
        log(`❌ Lỗi lấy stock: ${err.message}`, 'ERROR');
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. LẤY STOCK THEO SHOP
app.get('/api/stock/:shopName', (req, res) => {
    const { shopName } = req.params;
    
    try {
        const data = Object.values(stockStorage)
            .filter(item => item.shop === shopName && item.stock > 0)
            .sort((a, b) => a.item.localeCompare(b.item));
        
        log(`📤 Lấy stock shop ${shopName}: ${data.length} items`, 'DEBUG');
        res.json({
            success: true,
            shop: shopName,
            count: data.length,
            data: data
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. LẤY STOCK CỦA 1 ITEM
app.get('/api/stock/:shopName/:itemName', (req, res) => {
    const { shopName, itemName } = req.params;
    const key = `${shopName}_${itemName}`;
    
    const item = stockStorage[key];
    if (!item || item.stock <= 0) {
        return res.json({
            success: false,
            message: `Không tìm thấy ${itemName} ở ${shopName} hoặc stock = 0`
        });
    }
    
    res.json({
        success: true,
        data: item
    });
});

// 5. XÓA ITEM
app.delete('/api/stock/:shopName/:itemName', (req, res) => {
    const { shopName, itemName } = req.params;
    const key = `${shopName}_${itemName}`;
    
    if (!stockStorage[key]) {
        return res.json({
            success: false,
            message: `Không tìm thấy ${itemName} ở ${shopName}`
        });
    }
    
    const deleted = stockStorage[key];
    delete stockStorage[key];
    log(`🗑️ Đã xóa: ${shopName} | ${itemName}`, 'WARNING');
    
    res.json({
        success: true,
        message: `Đã xóa ${itemName} khỏi ${shopName}`,
        deleted: deleted
    });
});

// 6. DASHBOARD
app.get('/api/dashboard', (req, res) => {
    try {
        const items = Object.values(stockStorage).filter(item => item.stock > 0);
        const shops = {};
        let totalStock = 0;
        let maxStock = 0;
        let minStock = Infinity;
        
        items.forEach(item => {
            totalStock += item.stock;
            if (item.stock > maxStock) maxStock = item.stock;
            if (item.stock < minStock) minStock = item.stock;
            shops[item.shop] = (shops[item.shop] || 0) + 1;
        });
        
        const shopStats = Object.keys(shops).map(shop => ({
            shop,
            item_count: shops[shop],
            items: items.filter(item => item.shop === shop)
        }));
        
        res.json({
            success: true,
            statistics: {
                total_items: items.length,
                total_stock: totalStock,
                total_shops: Object.keys(shops).length,
                max_stock: maxStock,
                min_stock: minStock === Infinity ? 0 : minStock,
                avg_stock: items.length > 0 ? Math.round(totalStock / items.length) : 0
            },
            shops: shopStats,
            top_items: items
                .sort((a, b) => b.stock - a.stock)
                .slice(0, 5),
            last_updated: getTimestamp()
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. RESET TOÀN BỘ
app.delete('/api/reset', (req, res) => {
    const count = Object.keys(stockStorage).length;
    for (const key in stockStorage) {
        delete stockStorage[key];
    }
    log(`🗑️ Reset toàn bộ: ${count} items đã xóa`, 'WARNING');
    res.json({
        success: true,
        message: `🗑️ Đã xóa ${count} items khỏi bộ nhớ`,
        deleted_count: count
    });
});

// ============ XỬ LÝ LỖI 404 ============
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint không tồn tại',
        available_endpoints: [
            '/',
            '/health',
            '/api/logs',
            'POST /api/update-stock',
            'GET /api/stock',
            'GET /api/stock/:shop',
            'GET /api/stock/:shop/:item',
            'DELETE /api/stock/:shop/:item',
            'GET /api/dashboard',
            'DELETE /api/reset'
        ]
    });
});

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log(`
    🚀 BOTBYPASS API ĐANG CHẠY
    📡 URL: http://localhost:${PORT}
    💾 Storage: In-Memory (RAM)
    📋 ENDPOINTS:
    - GET    /                      (Trang chủ)
    - GET    /health                (Health check)
    - GET    /api/logs              (Xem logs)
    - POST   /api/update-stock      (Nhận từ Roblox)
    - GET    /api/stock             (Lấy tất cả)
    - GET    /api/stock/:shop       (Lấy theo shop)
    - GET    /api/stock/:shop/:item (Lấy 1 item)
    - DELETE /api/stock/:shop/:item (Xóa item)
    - GET    /api/dashboard         (Thống kê)
    - DELETE /api/reset             (Reset toàn bộ)
    `);
});

// ============ XỬ LÝ LỖI TOÀN CỤC ============
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
});

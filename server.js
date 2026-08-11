// server.js - Full Code cho Render với PostgreSQL
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============ KẾT NỐI DATABASE ============
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/stock_db',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Tạo bảng tự động
pool.query(`
    CREATE TABLE IF NOT EXISTS stock_items (
        id SERIAL PRIMARY KEY,
        shop_name VARCHAR(100) NOT NULL,
        item_name VARCHAR(100) NOT NULL,
        stock INT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(shop_name, item_name)
    )
`).then(() => {
    console.log('✅ Bảng stock_items đã sẵn sàng');
}).catch(err => {
    console.error('❌ Lỗi tạo bảng:', err.message);
});

// ============ API ENDPOINTS ============

// 1. Nhận dữ liệu từ Roblox (CHỈ LƯU KHI stock > 0)
app.post('/api/update-stock', async (req, res) => {
    const { shop, item, stock } = req.body;
    
    console.log(`📥 Nhận: ${shop} | ${item} = ${stock}`);
    
    // ❌ BỎ QUA NẾU stock <= 0
    if (stock <= 0) {
        return res.json({
            success: false,
            message: `⛔ Bỏ qua ${item} vì stock = ${stock} (không lưu)`
        });
    }
    
    try {
        // ✅ LƯU VÀO DB NẾU stock > 0
        const query = `
            INSERT INTO stock_items (shop_name, item_name, stock) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (shop_name, item_name) 
            DO UPDATE SET stock = $3, last_updated = CURRENT_TIMESTAMP
        `;
        await pool.query(query, [shop, item, stock]);
        
        console.log(`✅ Đã lưu: ${shop} | ${item} = ${stock}`);
        res.json({
            success: true,
            message: `✅ Đã cập nhật ${item} = ${stock}`,
            data: { shop, item, stock }
        });
    } catch (err) {
        console.error('❌ Lỗi DB:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Lấy tất cả stock (chỉ lấy > 0)
app.get('/api/stock', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM stock_items WHERE stock > 0 ORDER BY shop_name, item_name'
        );
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Lấy stock theo shop
app.get('/api/stock/:shopName', async (req, res) => {
    const { shopName } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT * FROM stock_items WHERE shop_name = $1 AND stock > 0',
            [shopName]
        );
        res.json({
            success: true,
            shop: shopName,
            count: result.rows.length,
            data: result.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Lấy stock của 1 item cụ thể
app.get('/api/stock/:shopName/:itemName', async (req, res) => {
    const { shopName, itemName } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT * FROM stock_items WHERE shop_name = $1 AND item_name = $2',
            [shopName, itemName]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                success: false,
                message: `Không tìm thấy ${itemName} ở ${shopName}`
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Xóa item (khi stock về 0)
app.delete('/api/stock/:shopName/:itemName', async (req, res) => {
    const { shopName, itemName } = req.params;
    
    try {
        await pool.query(
            'DELETE FROM stock_items WHERE shop_name = $1 AND item_name = $2',
            [shopName, itemName]
        );
        res.json({
            success: true,
            message: `Đã xóa ${itemName} khỏi ${shopName}`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Dashboard - Thống kê
app.get('/api/dashboard', async (req, res) => {
    try {
        // Thống kê tổng hợp
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_items,
                SUM(stock) as total_stock,
                COUNT(DISTINCT shop_name) as total_shops,
                MAX(stock) as max_stock,
                MIN(stock) as min_stock
            FROM stock_items 
            WHERE stock > 0
        `);
        
        // Thống kê theo shop
        const shopsResult = await pool.query(`
            SELECT shop_name, COUNT(*) as item_count, SUM(stock) as total_stock
            FROM stock_items 
            WHERE stock > 0
            GROUP BY shop_name
            ORDER BY shop_name
        `);
        
        res.json({
            success: true,
            statistics: statsResult.rows[0],
            shops: shopsResult.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Health Check (cho Render)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log(`
    🚀 API ĐANG CHẠY TẠI: http://localhost:${PORT}
    📋 ENDPOINTS:
    - POST   /api/update-stock     (Nhận từ Roblox)
    - GET    /api/stock            (Lấy tất cả)
    - GET    /api/stock/:shop      (Lấy theo shop)
    - GET    /api/stock/:shop/:item (Lấy 1 item)
    - DELETE /api/stock/:shop/:item (Xóa item)
    - GET    /api/dashboard        (Thống kê)
    - GET    /health               (Health check)
    `);
});

// Xử lý lỗi không bắt được
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
});

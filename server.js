// server.js - API Pro Max
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Kết nối Database
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'roblox_stock'
});

db.connect((err) => {
    if (err) throw err;
    console.log('✅ Đã kết nối MySQL!');
    
    // Tạo bảng tự động
    db.query(`
        CREATE TABLE IF NOT EXISTS stock_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            shop_name VARCHAR(100),
            item_name VARCHAR(100),
            stock INT DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_shop_item (shop_name, item_name)
        )
    `);
});

// ============ API ENDPOINTS ============

// 1. Nhận dữ liệu từ Roblox (CHỈ LƯU KHI stock > 0)
app.post('/api/update-stock', (req, res) => {
    const { shop, item, stock } = req.body;
    
    console.log(`📥 Nhận: ${shop} | ${item} = ${stock}`);
    
    // ❌ BỎ QUA NẾU stock <= 0
    if (stock <= 0) {
        return res.json({
            success: false,
            message: `⛔ Bỏ qua ${item} vì stock = ${stock} (không lưu)`
        });
    }
    
    // ✅ LƯU VÀO DB NẾU stock > 0
    const query = `
        INSERT INTO stock_items (shop_name, item_name, stock) 
        VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE stock = VALUES(stock)
    `;
    
    db.query(query, [shop, item, stock], (err, result) => {
        if (err) {
            console.error('❌ Lỗi DB:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        console.log(`✅ Đã lưu: ${shop} | ${item} = ${stock}`);
        res.json({
            success: true,
            message: `✅ Đã cập nhật ${item} = ${stock}`,
            data: { shop, item, stock }
        });
    });
});

// 2. Lấy tất cả stock (chỉ lấy > 0)
app.get('/api/stock', (req, res) => {
    db.query(
        'SELECT * FROM stock_items WHERE stock > 0 ORDER BY shop_name, item_name',
        (err, results) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                count: results.length,
                data: results
            });
        }
    );
});

// 3. Lấy stock theo shop
app.get('/api/stock/:shopName', (req, res) => {
    const { shopName } = req.params;
    
    db.query(
        'SELECT * FROM stock_items WHERE shop_name = ? AND stock > 0',
        [shopName],
        (err, results) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                success: true,
                shop: shopName,
                data: results
            });
        }
    );
});

// 4. Lấy stock của 1 item cụ thể
app.get('/api/stock/:shopName/:itemName', (req, res) => {
    const { shopName, itemName } = req.params;
    
    db.query(
        'SELECT * FROM stock_items WHERE shop_name = ? AND item_name = ?',
        [shopName, itemName],
        (err, results) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (results.length === 0) {
                return res.json({
                    success: false,
                    message: `Không tìm thấy ${itemName} ở ${shopName}`
                });
            }
            
            res.json({
                success: true,
                data: results[0]
            });
        }
    );
});

// 5. Xóa item (khi stock về 0)
app.delete('/api/stock/:shopName/:itemName', (req, res) => {
    const { shopName, itemName } = req.params;
    
    db.query(
        'DELETE FROM stock_items WHERE shop_name = ? AND item_name = ?',
        [shopName, itemName],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                success: true,
                message: `Đã xóa ${itemName} khỏi ${shopName}`
            });
        }
    );
});

// 6. Dashboard - Thống kê
app.get('/api/dashboard', (req, res) => {
    db.query(`
        SELECT 
            COUNT(*) as total_items,
            SUM(stock) as total_stock,
            COUNT(DISTINCT shop_name) as total_shops,
            MAX(stock) as max_stock,
            MIN(stock) as min_stock
        FROM stock_items 
        WHERE stock > 0
    `, (err, stats) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.query(`
            SELECT shop_name, COUNT(*) as item_count, SUM(stock) as total_stock
            FROM stock_items 
            WHERE stock > 0
            GROUP BY shop_name
        `, (err2, shops) => {
            res.json({
                success: true,
                statistics: stats[0],
                shops: shops
            });
        });
    });
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
    `);
});

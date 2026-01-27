/**
 * UnaLuka Price Approval System - Backend Server
 * Simple Express server with in-memory storage (can switch to PostgreSQL later)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for bulk sync
app.use(express.static(path.join(__dirname)));

// ============ IN-MEMORY STORAGE ============
// Easy to replace with PostgreSQL 17 later
const db = {
    products: new Map(),
    decisions: []
};

// ============ API ENDPOINTS ============

/**
 * POST /api/sync
 * Sync products from external source (n8n)
 * Expects array of products
 */
app.post('/api/sync', (req, res) => {
    const products = req.body;

    if (!Array.isArray(products)) {
        return res.status(400).json({ error: 'Expected array of products' });
    }

    try {
        for (const item of products) {
            db.products.set(item.sku, {
                ...item,
                status: 'pending',
                updated_at: new Date().toISOString()
            });
        }
        res.json({ success: true, count: products.length, total: db.products.size });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/products
 * Get all pending products for approval
 */
app.get('/api/products', (req, res) => {
    try {
        const pendingProducts = Array.from(db.products.values())
            .filter(p => p.status === 'pending')
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        res.json(pendingProducts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/stats
 * Get statistics for header (pending count, last update)
 */
app.get('/api/stats', (req, res) => {
    try {
        const pendingProducts = Array.from(db.products.values()).filter(p => p.status === 'pending');
        const lastUpdate = pendingProducts.reduce((max, p) => {
            return new Date(p.updated_at) > new Date(max) ? p.updated_at : max;
        }, '1970-01-01');

        res.json({
            pending_count: pendingProducts.length,
            last_update: pendingProducts.length > 0 ? lastUpdate : null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/decisions
 * Record user decision (approve/reject)
 */
app.post('/api/decisions', (req, res) => {
    const { sku, decision } = req.body;

    if (!sku || !decision) {
        return res.status(400).json({ error: 'SKU and decision required' });
    }

    if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'Decision must be "approved" or "rejected"' });
    }

    try {
        const product = db.products.get(sku);
        if (product) {
            product.status = decision;
            db.decisions.push({
                sku,
                decision,
                decided_at: new Date().toISOString()
            });
        }
        res.json({ success: true, sku, decision });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/decisions
 * Get all decisions (for n8n to retrieve)
 */
app.get('/api/decisions', (req, res) => {
    try {
        const decisionsWithProducts = db.decisions.map(d => {
            const product = db.products.get(d.sku);
            return {
                ...d,
                name: product?.name,
                competitor_price_usd: product?.competitor_price_usd,
                current_price_usd: product?.current_price_usd
            };
        });
        res.json(decisionsWithProducts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/seed
 * Generate mock data for testing (200 products)
 */
app.post('/api/seed', (req, res) => {
    const count = req.body.count || 200;
    const brands = ['Apple', 'Sony', 'Samsung', 'JBL', 'Bose', 'LG', 'Xiaomi', 'Huawei', 'Anker', 'Logitech'];
    const products = ['Auriculares', 'Laptop', 'Tablet', 'Smartwatch', 'Cargador', 'Mouse', 'Teclado', 'Monitor', 'Webcam', 'Speaker'];
    const variants = ['Pro', 'Max', 'Mini', 'Ultra', 'Plus', 'Lite', 'SE', 'Air', 'Elite', 'Classic'];

    try {
        for (let i = 1; i <= count; i++) {
            const brand = brands[Math.floor(Math.random() * brands.length)];
            const product = products[Math.floor(Math.random() * products.length)];
            const variant = variants[Math.floor(Math.random() * variants.length)];

            const competitorPrice = Math.floor(Math.random() * 900) + 100;
            const marginVariation = (Math.random() - 0.3) * 0.4; // -30% to +10%
            const currentPrice = Math.round(competitorPrice * (1 + marginVariation));
            const margin = Math.round(((currentPrice - competitorPrice) / competitorPrice) * 100);

            const sku = `${brand.toUpperCase().slice(0, 3)}-${product.toUpperCase().slice(0, 3)}-${i.toString().padStart(3, '0')}`;

            db.products.set(sku, {
                sku,
                name: `${brand} ${product} ${variant} - Modelo ${i}`,
                competitor_price_usd: competitorPrice,
                competitor_price_local: Math.round(competitorPrice * 3.8),
                current_price_usd: currentPrice,
                current_price_local: Math.round(currentPrice * 3.8),
                margin_percentage: margin,
                status: 'pending',
                updated_at: new Date().toISOString()
            });
        }

        res.json({ success: true, count, total: db.products.size });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/reset
 * Reset all data (for testing)
 */
app.delete('/api/reset', (req, res) => {
    db.products.clear();
    db.decisions = [];
    res.json({ success: true, message: 'All data cleared' });
});

/**
 * POST /api/undo
 * Undo last decision - restore product to pending
 */
app.post('/api/undo', (req, res) => {
    const { sku } = req.body;

    if (!sku) {
        return res.status(400).json({ error: 'SKU required' });
    }

    try {
        const product = db.products.get(sku);
        if (product) {
            product.status = 'pending';
            // Remove from decisions
            const decisionIndex = db.decisions.findIndex(d => d.sku === sku);
            if (decisionIndex > -1) {
                db.decisions.splice(decisionIndex, 1);
            }
        }
        res.json({ success: true, sku });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 UnaLuka Price Approval Server running on http://localhost:${PORT}\n`);
    console.log(`📊 API endpoints:`);
    console.log(`   GET  /api/products  - List pending products`);
    console.log(`   GET  /api/stats     - Get statistics`);
    console.log(`   POST /api/sync      - Sync products from n8n`);
    console.log(`   POST /api/decisions - Record approval/rejection`);
    console.log(`   POST /api/seed      - Generate mock products (default: 200)`);
    console.log(`   DELETE /api/reset   - Clear all data`);
    console.log(`\n💡 Quick start: Run this in another terminal:`);
    console.log(`   curl -X POST http://localhost:${PORT}/api/seed\n`);
});

/**
 * UnaLuka Price Approval System - Backend Server
 * Simple Express server with in-memory storage (can switch to PostgreSQL later)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

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
    decisions: [],
    sessions: new Map() // Active sessions
};

// ============ USERS (In-memory, can migrate to DB) ============
const users = [
    {
        id: 1,
        email: 'admin@unaluka.com',
        password: 'unaluka2026',
        name: 'Admin',
        role: 'admin',
        mustChangePassword: false
    }
];

let nextUserId = 2;

// ============ AUTH HELPERS ============
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateTempPassword() {
    // Generate a readable temporary password like "TempXXXX"
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let password = 'Temp';
    for (let i = 0; i < 6; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

function findUserByEmail(email) {
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

function findUserById(id) {
    return users.find(u => u.id === id);
}

function validateSession(token) {
    const session = db.sessions.get(token);
    if (!session) return null;

    // Check if session expired (24 hours)
    if (Date.now() > session.expiresAt) {
        db.sessions.delete(token);
        return null;
    }

    return session;
}

// ============ AUTH MIDDLEWARE ============
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.split(' ')[1];
    const session = validateSession(token);

    if (!session) {
        return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    req.user = session.user;
    next();
}
// ============ SESSION CONFIGURATION ============
const SESSION_DURATION_DEFAULT = 8 * 60 * 60 * 1000;  // 8 hours (normal session)
const SESSION_DURATION_REMEMBER = 24 * 60 * 60 * 1000; // 24 hours (remember me)

// ============ AUTH ENDPOINTS ============

/**
 * POST /api/login
 * Authenticate user and return session token
 */
app.post('/api/login', (req, res) => {
    const { email, password, remember } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    const user = findUserByEmail(email);

    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Create session with appropriate duration
    const duration = remember ? SESSION_DURATION_REMEMBER : SESSION_DURATION_DEFAULT;
    const token = generateToken();
    const expiresAt = Date.now() + duration;

    const session = {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        createdAt: Date.now(),
        expiresAt,
        remember: !!remember
    };

    db.sessions.set(token, session);

    const hoursRemaining = Math.round(duration / (60 * 60 * 1000));
    console.log(`🔐 User logged in: ${user.email} (session: ${hoursRemaining}h)`);

    res.json({
        success: true,
        token,
        user: session.user,
        expiresAt,
        expiresIn: duration,
        mustChangePassword: user.mustChangePassword || false
    });
});

/**
 * GET /api/verify
 * Verify if session token is valid
 */
app.get('/api/verify', (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ valid: false });
    }

    const token = authHeader.split(' ')[1];
    const session = validateSession(token);

    if (!session) {
        return res.status(401).json({ valid: false });
    }

    res.json({ valid: true, user: session.user });
});

/**
 * POST /api/logout
 * Invalidate session token
 */
app.post('/api/logout', (req, res) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        db.sessions.delete(token);
    }

    res.json({ success: true });
});

// ============ USER MANAGEMENT ENDPOINTS ============

/**
 * POST /api/users
 * Create a new user (admin only)
 * Returns temporary password
 */
app.post('/api/users', authMiddleware, (req, res) => {
    // Check if admin
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo administradores pueden crear usuarios' });
    }

    const { email, name } = req.body;

    if (!email || !name) {
        return res.status(400).json({ error: 'Email y nombre son requeridos' });
    }

    // Check if email already exists
    if (findUserByEmail(email)) {
        return res.status(400).json({ error: 'El correo ya está registrado' });
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();

    const newUser = {
        id: nextUserId++,
        email: email.toLowerCase().trim(),
        name: name.trim(),
        password: tempPassword,
        role: 'user',
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
    };

    users.push(newUser);

    console.log(`👤 New user created: ${newUser.email} by ${req.user.email}`);

    res.json({
        success: true,
        user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            role: newUser.role
        },
        tempPassword
    });
});

/**
 * GET /api/users
 * List all users (admin only)
 */
app.get('/api/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo administradores pueden ver usuarios' });
    }

    const usersList = users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        mustChangePassword: u.mustChangePassword || false,
        createdAt: u.createdAt
    }));

    res.json(usersList);
});

/**
 * DELETE /api/users/:id
 * Delete a user (admin only, cannot delete self)
 */
app.delete('/api/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo administradores pueden eliminar usuarios' });
    }

    const userId = parseInt(req.params.id);

    if (userId === req.user.id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }

    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const deletedUser = users.splice(userIndex, 1)[0];
    console.log(`🗑️ User deleted: ${deletedUser.email} by ${req.user.email}`);

    res.json({ success: true });
});

/**
 * POST /api/change-password
 * Change user's own password
 */
app.post('/api/change-password', authMiddleware, (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const user = findUserById(req.user.id);
    if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // If not changing from temp password, verify current password
    if (!user.mustChangePassword && user.password !== currentPassword) {
        return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    user.password = newPassword;
    user.mustChangePassword = false;

    console.log(`🔑 Password changed: ${user.email}`);

    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
});

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
app.post('/api/decisions', authMiddleware, (req, res) => {
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
                decided_at: new Date().toISOString(),
                approved_by: req.user.name // Capture user name
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
 * GET /api/export/approvals
 * Export today's approved decisions as CSV for marketplace upload
 */
app.get('/api/export/approvals', (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let start, end;

        // Helper to create date from YYYY-MM-DD in local time
        const parseLocal = (dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d);
        };

        if (startDate) {
            start = parseLocal(startDate);
            start.setHours(0, 0, 0, 0);
        } else {
            start = new Date();
            start.setHours(0, 0, 0, 0);
        }

        if (endDate) {
            end = parseLocal(endDate);
            end.setHours(23, 59, 59, 999);
        } else {
            end = new Date();
            end.setHours(23, 59, 59, 999);
        }

        // Filter only approved decisions within range
        const approvedDecisions = db.decisions.filter(d => {
            const decisionDate = new Date(d.decided_at);
            return d.decision === 'approved' &&
                decisionDate >= start &&
                decisionDate <= end;
        });

        const exportItems = approvedDecisions.map(d => {
            const product = db.products.get(d.sku);
            return {
                sku: d.sku,
                name: product?.name || '',
                new_price_usd: product?.competitor_price_usd || 0,
                new_price_local: product?.competitor_price_local || 0,
                margin_percentage: product?.margin_percentage || 0,
                decided_at: d.decided_at,
                approved_by: d.approved_by || 'Sistema'
            };
        });

        // Check if user wants JSON or CSV
        const format = req.query.format || 'csv';

        if (format === 'json') {
            return res.json({
                range: { start: start.toISOString(), end: end.toISOString() },
                count: exportItems.length,
                approvals: exportItems
            });
        }

        // Generate CSV
        // Columns: SKU, Producto, Precio nuevo USD, Precio nuevo PEN, Margen, Fecha de aprobación, Encargado de aprobación
        const headers = ['SKU', 'Producto', 'Precio nuevo USD', 'Precio nuevo PEN', 'Margen', 'Fecha aprobación', 'Encargado'];
        const csvRows = [headers.join(',')];

        for (const item of exportItems) {
            const date = new Date(item.decided_at);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;

            csvRows.push([
                `"${item.sku}"`,
                `"${item.name.replace(/"/g, '""')}"`,
                item.new_price_usd.toFixed(2),
                item.new_price_local.toFixed(2),
                `${item.margin_percentage.toFixed(1)}%`,
                `"${formattedDate}"`,
                `"${item.approved_by}"`
            ].join(','));
        }

        const csv = csvRows.join('\n');
        const sDate = start.toISOString().split('T')[0];
        const eDate = end.toISOString().split('T')[0];
        const filename = `aprobaciones_${sDate}_${eDate}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv); // BOM for Excel UTF-8 compatibility

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
                product_url: `https://amazon.com/dp/${sku.replace(/-/g, '')}`,
                category: 'Tech',
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

// ============ WEBHOOK ENDPOINTS ============

/**
 * POST /api/webhook/publish
 * Send approved products to external webhook
 */
app.post('/api/webhook/publish', authMiddleware, async (req, res) => {
    try {
        // Filter only approved decisions
        const approvedDecisions = db.decisions.filter(d => d.decision === 'approved');

        if (approvedDecisions.length === 0) {
            return res.json({ success: true, count: 0, message: 'No hay productos aprobados para enviar' });
        }

        // Map data to the format expected by the webhook (enrich with product details)
        const payload = approvedDecisions.map(d => {
            const product = db.products.get(d.sku);
            return {
                sku: d.sku,
                name: product?.name || '',
                product_url: product?.product_url || '',
                category: product?.category || '',
                competitor_price_usd: product?.competitor_price_usd,
                competitor_price_local: product?.competitor_price_local,
                current_price_usd: product?.current_price_usd,
                current_price_local: product?.current_price_local,
                margin_percentage: product?.margin_percentage,
                approved_at: d.decided_at,
                approved_by: d.approved_by,
                status: 'approved'
            };
        });

        // External Webhook URL
        const WEBHOOK_URL = 'https://integrations.unalukaglobal.com/webhook/output-pricing-model';

        console.log(`📤 Sending ${payload.length} products to webhook: ${WEBHOOK_URL}`);

        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Webhook responded with status: ${response.status}`);
        }

        res.json({ success: true, count: payload.length });

    } catch (error) {
        console.error('❌ Webhook error:', error.message);
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

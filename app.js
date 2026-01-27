/**
 * UnaLuka Price Approval System - Frontend Application
 * Optimized for 200+ cards with virtual scrolling (3-column grid)
 */

(function () {
    'use strict';

    // ============ CONFIGURATION ============
    const API_BASE = 'http://localhost:3000/api';
    const COLUMNS = 3;           // Number of columns in grid
    const ROW_HEIGHT = 320;      // Approximate height of each row in pixels
    const BUFFER_ROWS = 3;       // Extra rows to render above/below viewport
    const DEBOUNCE_MS = 16;      // ~60fps
    const GAP = 24;              // Grid gap in pixels

    // ============ STATE ============
    let products = [];
    let visibleRange = { startRow: 0, endRow: 0 };
    let isLoading = false;
    let lastAction = null; // For undo functionality

    // ============ DOM ELEMENTS ============
    const grid = document.getElementById('product-grid');
    const pendingCount = document.getElementById('pending-count');
    const lastUpdate = document.getElementById('last-update');

    // ============ INITIALIZATION ============
    async function init() {
        showLoadingState();
        await loadProducts();
        await loadStats();
        setupVirtualScroll();
        setupToastContainer();
        setupUndoButton();
        hideLoadingState();
    }

    // ============ API CALLS ============
    async function loadProducts() {
        try {
            const response = await fetch(`${API_BASE}/products`);
            products = await response.json();
            console.log(`📦 Loaded ${products.length} products`);
        } catch (error) {
            console.error('Error loading products:', error);
            products = [];
        }
    }

    async function loadStats() {
        try {
            const response = await fetch(`${API_BASE}/stats`);
            const stats = await response.json();

            if (pendingCount) {
                pendingCount.textContent = `${stats.pending_count} Productos`;
            }
            if (lastUpdate && stats.last_update) {
                const date = new Date(stats.last_update);
                lastUpdate.textContent = date.toLocaleString('es-PE');
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async function submitDecision(sku, decision) {
        try {
            const response = await fetch(`${API_BASE}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku, decision })
            });

            if (response.ok) {
                // Find and remove product from local array
                const index = products.findIndex(p => p.sku === sku);
                if (index > -1) {
                    const removedProduct = products[index];
                    products.splice(index, 1);

                    // Save for undo
                    lastAction = { sku, decision, product: removedProduct };

                    // Show toast notification
                    const actionText = decision === 'approved' ? 'Precio aceptado' : 'Precio rechazado';
                    showToast(`${actionText} - ${sku}`, decision === 'approved' ? 'success' : 'error');

                    // Show undo button
                    showUndoButton();

                    updateTotalHeight();
                    renderVisibleCards();
                    loadStats();
                }
                return true;
            }
        } catch (error) {
            console.error('Error submitting decision:', error);
            showToast('Error al procesar', 'error');
        }
        return false;
    }

    // ============ VIRTUAL SCROLLING (GRID COMPATIBLE) ============
    function getColumnsCount() {
        // Responsive: check actual grid columns
        const width = window.innerWidth;
        if (width <= 768) return 1;
        if (width <= 1024) return 2;
        return 3;
    }

    function getTotalRows() {
        const cols = getColumnsCount();
        return Math.ceil(products.length / cols);
    }

    function setupVirtualScroll() {
        // Clear and setup grid structure
        grid.innerHTML = '';

        // Create top spacer (for virtual scroll offset)
        const topSpacer = document.createElement('div');
        topSpacer.id = 'top-spacer';
        topSpacer.style.cssText = 'grid-column: 1 / -1; height: 0px;';
        grid.appendChild(topSpacer);

        // Create container for visible cards (will be a fragment of cards)
        const container = document.createElement('div');
        container.id = 'cards-container';
        container.style.cssText = `
            display: contents;
        `;
        grid.appendChild(container);

        // Create bottom spacer
        const bottomSpacer = document.createElement('div');
        bottomSpacer.id = 'bottom-spacer';
        bottomSpacer.style.cssText = 'grid-column: 1 / -1; height: 0px;';
        grid.appendChild(bottomSpacer);

        // Initial render
        calculateVisibleRange();
        renderVisibleCards();

        // Setup scroll listener with debouncing
        let scrollTimeout;
        let resizeTimeout;

        window.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            scrollTimeout = setTimeout(() => {
                scrollTimeout = null;
                calculateVisibleRange();
                renderVisibleCards();
            }, DEBOUNCE_MS);
        }, { passive: true });

        // Handle resize (columns might change)
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                calculateVisibleRange();
                renderVisibleCards();
            }, 100);
        }, { passive: true });
    }

    function updateTotalHeight() {
        // Recalculate spacers when products change
        calculateVisibleRange();
    }

    function calculateVisibleRange() {
        const scrollTop = window.scrollY;
        const viewportHeight = window.innerHeight;
        const headerHeight = 100;
        const cols = getColumnsCount();
        const totalRows = getTotalRows();

        // Calculate which rows should be visible
        const startRow = Math.max(0, Math.floor((scrollTop - headerHeight) / ROW_HEIGHT) - BUFFER_ROWS);
        const endRow = Math.min(
            totalRows,
            Math.ceil((scrollTop + viewportHeight - headerHeight) / ROW_HEIGHT) + BUFFER_ROWS
        );

        visibleRange = { startRow, endRow, cols };
    }

    function renderVisibleCards() {
        const container = document.getElementById('cards-container');
        const topSpacer = document.getElementById('top-spacer');
        const bottomSpacer = document.getElementById('bottom-spacer');

        if (!container || !topSpacer || !bottomSpacer) return;

        const { startRow, endRow, cols } = visibleRange;
        const totalRows = getTotalRows();

        // Calculate product indices
        const startIndex = startRow * cols;
        const endIndex = Math.min(endRow * cols, products.length);

        // Update spacers to maintain scroll position
        topSpacer.style.height = `${startRow * ROW_HEIGHT}px`;
        bottomSpacer.style.height = `${Math.max(0, (totalRows - endRow) * ROW_HEIGHT)}px`;

        // Get visible products
        const visibleProducts = products.slice(startIndex, endIndex);

        // Render cards
        container.innerHTML = visibleProducts.map(product => createCardHTML(product)).join('');

        // Attach event listeners
        attachCardListeners(container);
    }

    // ============ CARD RENDERING ============
    function createCardHTML(product) {
        const marginClass = product.margin_percentage < 0 ? 'negative' : '';
        const marginSign = product.margin_percentage >= 0 ? '+' : '';

        return `
            <div class="card" data-sku="${escapeHtml(product.sku)}">
                <div class="card-header">
                    <span class="product-sku">SKU: ${escapeHtml(product.sku)}</span>
                    <h2 class="product-title">${escapeHtml(product.name)}</h2>
                    <div class="margin-stat">
                        <span class="margin-label">Margen:</span>
                        <span class="margin-value ${marginClass}">${marginSign} ${product.margin_percentage}%</span>
                    </div>
                </div>

                <div class="prices-container">
                    <div class="price-box">
                        <span class="price-label">Precio Amazon (Nuevo)</span>
                        <div class="current-price">$${formatPrice(product.competitor_price_usd)}</div>
                        <div class="current-price-local">S/ ${formatPrice(product.competitor_price_local)}</div>
                    </div>
                    <div class="price-box">
                        <span class="price-label">Precio UnaLuka (Actual)</span>
                        <div class="old-price">$${formatPrice(product.current_price_usd)}</div>
                        <div class="old-price-local">S/ ${formatPrice(product.current_price_local)}</div>
                    </div>
                </div>

                <div class="actions">
                    <button class="btn btn-reject" data-action="reject" data-sku="${escapeHtml(product.sku)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                        Rechazar
                    </button>
                    <button class="btn btn-accept" data-action="approve" data-sku="${escapeHtml(product.sku)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Aprobar cambio
                    </button>
                </div>
            </div>
        `;
    }

    function attachCardListeners(container) {
        container.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.currentTarget;
                const sku = button.dataset.sku;
                const action = button.dataset.action;
                const decision = action === 'approve' ? 'approved' : 'rejected';

                // Disable button during request
                button.disabled = true;

                // Find card and animate out
                const card = button.closest('.card');
                if (card) {
                    card.classList.add(action === 'approve' ? 'approved-exit' : 'rejected-exit');
                }

                // Wait for animation then submit
                setTimeout(async () => {
                    await submitDecision(sku, decision);
                }, 300);
            });
        });
    }

    // ============ UTILITIES ============
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatPrice(price) {
        return Number(price).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function showLoadingState() {
        isLoading = true;
        grid.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>Cargando productos...</p>
            </div>
        `;
    }

    function hideLoadingState() {
        isLoading = false;
    }

    // ============ TOAST NOTIFICATIONS ============
    function setupToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✓' : '✗'}</span>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Remove after 4 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ============ UNDO FUNCTIONALITY ============
    function setupUndoButton() {
        const undoBtn = document.createElement('button');
        undoBtn.id = 'undo-btn';
        undoBtn.className = 'btn-undo hidden';
        undoBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 10h10a5 5 0 0 1 5 5v2"></path>
                <polyline points="3 10 8 5 3 10 8 15"></polyline>
            </svg>
            Deshacer
        `;
        undoBtn.addEventListener('click', undoLastAction);
        document.body.appendChild(undoBtn);
    }

    function showUndoButton() {
        const btn = document.getElementById('undo-btn');
        if (btn) {
            btn.classList.remove('hidden');
            // Auto hide after 10 seconds
            setTimeout(() => {
                btn.classList.add('hidden');
            }, 10000);
        }
    }

    function hideUndoButton() {
        const btn = document.getElementById('undo-btn');
        if (btn) btn.classList.add('hidden');
    }

    async function undoLastAction() {
        if (!lastAction) return;

        try {
            // Restore product to pending
            const response = await fetch(`${API_BASE}/undo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku: lastAction.sku })
            });

            if (response.ok) {
                // Re-add product to local array
                products.unshift(lastAction.product);
                renderVisibleCards();
                loadStats();
                showToast(`Deshecho: ${lastAction.sku} volvió a pendientes`, 'success');
                lastAction = null;
                hideUndoButton();
            }
        } catch (error) {
            console.error('Error undoing action:', error);
            showToast('Error al deshacer', 'error');
        }
    }

    // ============ START ============
    document.addEventListener('DOMContentLoaded', init);
})();

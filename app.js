/**
 * UnaLuka Price Approval System - Frontend Application
 * Row-based layout with multi-select and bulk actions
 */

(function () {
    'use strict';

    // ============ CONFIGURATION ============
    const API_BASE = 'http://localhost:3000/api';
    const ROW_HEIGHT = 65;       // Approximate height of each row in pixels
    const BUFFER_ROWS = 5;       // Extra rows to render above/below viewport
    const DEBOUNCE_MS = 16;      // ~60fps
    const SESSION_KEY = 'unaluka_session';

    // ============ AUTH HELPERS ============
    const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

    function getSessionToken() {
        return localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    }

    function getSessionExpiration() {
        return localStorage.getItem('unaluka_expires') || sessionStorage.getItem('unaluka_expires');
    }

    function getAuthHeaders() {
        const token = getSessionToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    function isSessionExpired() {
        const expiresAt = getSessionExpiration();
        if (!expiresAt) return true;
        return Date.now() > parseInt(expiresAt);
    }

    async function checkAuth() {
        const token = getSessionToken();
        if (!token) {
            redirectToLogin();
            return false;
        }

        // Check client-side expiration first
        if (isSessionExpired()) {
            console.log('⏰ Session expired');
            clearAuthStorage();
            redirectToLogin();
            return false;
        }

        try {
            const response = await fetch(`${API_BASE}/verify`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                clearAuthStorage();
                redirectToLogin();
                return false;
            }

            // Setup periodic session check
            startSessionMonitor();

            return true;
        } catch {
            redirectToLogin();
            return false;
        }
    }

    function startSessionMonitor() {
        setInterval(() => {
            if (isSessionExpired()) {
                console.log('⏰ Session expired during use');
                showToast('Tu sesión ha expirado. Redirigiendo...', 'warning');
                setTimeout(() => {
                    clearAuthStorage();
                    redirectToLogin();
                }, 2000);
            }
        }, SESSION_CHECK_INTERVAL);
    }

    function clearAuthStorage() {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('unaluka_user');
        localStorage.removeItem('unaluka_expires');
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem('unaluka_user');
        sessionStorage.removeItem('unaluka_expires');
    }

    function redirectToLogin() {
        window.location.href = '/login.html';
    }

    function logout() {
        const token = getSessionToken();
        if (token) {
            fetch(`${API_BASE}/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(() => { });
        }
        clearAuthStorage();
        redirectToLogin();
    }

    // ============ STATE ============
    let products = [];
    let selectedSkus = new Set();
    let visibleRange = { startRow: 0, endRow: 0 };
    let isLoading = false;
    let lastAction = null;

    // Drag selection state
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let selectionBeforeDrag = new Set();

    // ============ DOM ELEMENTS ============
    const grid = document.getElementById('product-grid');
    const pendingCount = document.getElementById('pending-count');
    const lastUpdate = document.getElementById('last-update');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const selectedCountEl = document.getElementById('selected-count');
    const bulkAcceptBtn = document.getElementById('bulk-accept');
    const bulkRejectBtn = document.getElementById('bulk-reject');
    const btnExport = document.getElementById('btn-export');
    const exportCountEl = document.getElementById('export-count');

    // ============ INITIALIZATION ============
    async function init() {
        // Check authentication first
        const isAuthenticated = await checkAuth();
        if (!isAuthenticated) return;

        showLoadingState();
        setupUserMenu();
        await loadProducts();
        await loadStats();
        await loadExportCount();
        setupVirtualScroll();
        setupToastContainer();
        setupUndoButton();
        setupBulkActions();
        setupDragSelection();
        setupFilterControl();
        setupExportButton();
        hideLoadingState();
    }

    function setupUserMenu() {
        const userNameEl = document.getElementById('user-name');
        const btnLogout = document.getElementById('btn-logout');

        // Display user name
        const userInfo = localStorage.getItem('unaluka_user') || sessionStorage.getItem('unaluka_user');
        if (userInfo && userNameEl) {
            try {
                const user = JSON.parse(userInfo);
                userNameEl.textContent = user.name || user.email;
            } catch {
                userNameEl.textContent = 'Usuario';
            }
        }

        // Setup logout button
        if (btnLogout) {
            btnLogout.addEventListener('click', logout);
        }
    }

    // ============ FILTER STATE ============
    let allProducts = []; // Store all products before filtering
    let filterEnabled = true;
    let variationMin = -2; // Minimum variation (negative)
    let variationMax = 2;  // Maximum variation (positive)

    // ============ API CALLS ============
    async function loadProducts() {
        try {
            const response = await fetch(`${API_BASE}/products`);
            allProducts = await response.json();
            applyFilter();
            console.log(`📦 Loaded ${allProducts.length} products`);
        } catch (error) {
            console.error('Error loading products:', error);
            allProducts = [];
            products = [];
        }
    }

    function applyFilter() {
        if (filterEnabled) {
            products = allProducts.filter(product => {
                const variation = ((product.competitor_price_usd - product.current_price_usd) / product.current_price_usd) * 100;
                // Show products OUTSIDE the range [min, max]
                return variation < variationMin || variation > variationMax;
            });
            console.log(`🔍 Showing ${products.length}/${allProducts.length} products (filtering ${variationMin}% to ${variationMax}%)`);
        } else {
            products = [...allProducts];
            console.log(`🔍 Showing all ${products.length} products (filter disabled)`);
        }

        // Clear selection when filter changes
        selectedSkus.clear();
        updateSelectionUI();
        renderVisibleRows();
    }

    function setupFilterControl() {
        const filterToggle = document.getElementById('filter-toggle');
        const filterMin = document.getElementById('filter-min');
        const filterMax = document.getElementById('filter-max');
        const filterControl = document.getElementById('filter-control');

        if (filterToggle) {
            filterToggle.addEventListener('change', (e) => {
                filterEnabled = e.target.checked;

                // Disable inputs when filter is off
                if (filterMin) filterMin.disabled = !filterEnabled;
                if (filterMax) filterMax.disabled = !filterEnabled;

                // Visual feedback
                if (filterControl) {
                    filterControl.classList.toggle('disabled', !filterEnabled);
                }

                applyFilter();
            });
        }

        // Min input (negative values)
        if (filterMin) {
            filterMin.addEventListener('change', (e) => {
                variationMin = parseFloat(e.target.value) || 0;
                // Ensure min is negative or zero
                if (variationMin > 0) {
                    variationMin = -variationMin;
                    e.target.value = variationMin;
                }
                if (filterEnabled) applyFilter();
            });

            filterMin.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    variationMin = parseFloat(e.target.value) || 0;
                    if (variationMin > 0) {
                        variationMin = -variationMin;
                        e.target.value = variationMin;
                    }
                    if (filterEnabled) applyFilter();
                }
            });
        }

        // Max input (positive values)
        if (filterMax) {
            filterMax.addEventListener('change', (e) => {
                variationMax = parseFloat(e.target.value) || 0;
                // Ensure max is positive or zero
                if (variationMax < 0) {
                    variationMax = -variationMax;
                    e.target.value = variationMax;
                }
                if (filterEnabled) applyFilter();
            });

            filterMax.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    variationMax = parseFloat(e.target.value) || 0;
                    if (variationMax < 0) {
                        variationMax = -variationMax;
                        e.target.value = variationMax;
                    }
                    if (filterEnabled) applyFilter();
                }
            });
        }
    }

    // ============ EXPORT FUNCTIONALITY ============
    async function loadExportCount() {
        try {
            const response = await fetch(`${API_BASE}/export/approvals?format=json`);
            const data = await response.json();

            if (exportCountEl) {
                exportCountEl.textContent = data.count || 0;
                exportCountEl.classList.toggle('has-items', data.count > 0);
            }

            if (btnExport) {
                btnExport.disabled = (data.count || 0) === 0;
            }
        } catch (error) {
            console.error('Error loading export count:', error);
            if (exportCountEl) exportCountEl.textContent = '0';
        }
    }

    function setupExportButton() {
        if (!btnExport) return;

        btnExport.addEventListener('click', () => {
            openExportModal();
        });

        setupExportModal();
    }

    // Update export count after each approval
    function updateExportCount() {
        loadExportCount();
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

    async function submitDecision(sku, decision, skipUndo = false) {
        try {
            const response = await fetch(`${API_BASE}/decisions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({ sku, decision })
            });

            if (response.ok) {
                const index = products.findIndex(p => p.sku === sku);
                if (index > -1) {
                    const removedProduct = products[index];
                    products.splice(index, 1);
                    selectedSkus.delete(sku);

                    // Solo guardar para undo si no es parte de una acción en lote
                    if (!skipUndo) {
                        lastAction = {
                            type: 'single',
                            decision,
                            products: [removedProduct]
                        };
                        showUndoButton();
                    }

                    // Update export count if approved
                    if (decision === 'approved') {
                        updateExportCount();
                    }

                    return removedProduct;
                }
            }
        } catch (error) {
            console.error('Error submitting decision:', error);
            showToast('Error al procesar', 'error');
        }
        return null;
    }

    async function submitBulkDecision(skus, decision) {
        // Guardar productos antes de eliminarlos
        const productsToRemove = skus.map(sku => products.find(p => p.sku === sku)).filter(Boolean);

        const results = await Promise.all(
            skus.map(sku => submitDecision(sku, decision, true)) // skipUndo = true
        );

        const successfulProducts = results.filter(Boolean);

        if (successfulProducts.length > 0) {
            // Guardar todo el conjunto para undo
            lastAction = {
                type: 'bulk',
                decision,
                products: successfulProducts
            };
            showUndoButton();
        }

        return successfulProducts.length;
    }

    // ============ VIRTUAL SCROLLING ============
    function getTotalRows() {
        return products.length;
    }

    function setupVirtualScroll() {
        grid.innerHTML = '';

        // Create top spacer
        const topSpacer = document.createElement('div');
        topSpacer.id = 'top-spacer';
        grid.appendChild(topSpacer);

        // Create container for visible rows
        const container = document.createElement('div');
        container.id = 'rows-container';
        grid.appendChild(container);

        // Create bottom spacer
        const bottomSpacer = document.createElement('div');
        bottomSpacer.id = 'bottom-spacer';
        grid.appendChild(bottomSpacer);

        // Initial render
        calculateVisibleRange();
        renderVisibleRows();

        // Setup scroll listener with debouncing
        let scrollTimeout;
        let resizeTimeout;

        window.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            scrollTimeout = setTimeout(() => {
                scrollTimeout = null;
                calculateVisibleRange();
                renderVisibleRows();
            }, DEBOUNCE_MS);
        }, { passive: true });

        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                calculateVisibleRange();
                renderVisibleRows();
            }, 100);
        }, { passive: true });
    }

    function calculateVisibleRange() {
        const scrollTop = window.scrollY;
        const viewportHeight = window.innerHeight;
        const headerHeight = 180; // Header + bulk actions bar
        const totalRows = getTotalRows();

        const startRow = Math.max(0, Math.floor((scrollTop - headerHeight) / ROW_HEIGHT) - BUFFER_ROWS);
        const endRow = Math.min(
            totalRows,
            Math.ceil((scrollTop + viewportHeight - headerHeight) / ROW_HEIGHT) + BUFFER_ROWS
        );

        visibleRange = { startRow, endRow };
    }

    function renderVisibleRows() {
        const container = document.getElementById('rows-container');
        const topSpacer = document.getElementById('top-spacer');
        const bottomSpacer = document.getElementById('bottom-spacer');

        if (!container || !topSpacer || !bottomSpacer) return;

        const { startRow, endRow } = visibleRange;
        const totalRows = getTotalRows();

        // Update spacers
        topSpacer.style.height = `${startRow * ROW_HEIGHT}px`;
        bottomSpacer.style.height = `${Math.max(0, (totalRows - endRow) * ROW_HEIGHT)}px`;

        // Get visible products
        const visibleProducts = products.slice(startRow, endRow);

        if (visibleProducts.length === 0 && products.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                    </svg>
                    <h3>No hay productos pendientes</h3>
                    <p>Todos los productos han sido procesados</p>
                </div>
            `;
            return;
        }

        // Render rows
        container.innerHTML = visibleProducts.map(product => createRowHTML(product)).join('');

        // Attach event listeners
        attachRowListeners(container);
    }

    // ============ ROW RENDERING ============
    function createRowHTML(product) {
        const isSelected = selectedSkus.has(product.sku);
        const isPositiveMargin = product.margin_percentage >= 0;
        const marginSign = isPositiveMargin ? '+' : '';

        // Calcular variación: ((precio_amazon - precio_unaluka) / precio_unaluka) * 100
        const variation = ((product.competitor_price_usd - product.current_price_usd) / product.current_price_usd) * 100;
        const isPositiveVariation = variation >= 0;
        const variationSign = isPositiveVariation ? '+' : '';

        return `
            <div class="product-row ${isSelected ? 'selected' : ''}" data-sku="${escapeHtml(product.sku)}">
                <div class="col-checkbox">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" class="row-checkbox" data-sku="${escapeHtml(product.sku)}" ${isSelected ? 'checked' : ''}>
                        <span class="checkmark"></span>
                    </label>
                </div>
                <div class="col-sku">${escapeHtml(product.sku)}</div>
                <div class="col-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</div>
                <div class="col-amazon">
                    <span class="price-usd">$${formatPrice(product.competitor_price_usd)}</span>
                    <span class="price-local">S/ ${formatPrice(product.competitor_price_local)}</span>
                </div>
                <div class="col-unaluka">
                    <span class="price-usd">$${formatPrice(product.current_price_usd)}</span>
                    <span class="price-local">S/ ${formatPrice(product.current_price_local)}</span>
                </div>
                <div class="col-variation">
                    <span class="variation-badge ${isPositiveVariation ? 'positive' : 'negative'}">${variationSign}${variation.toFixed(1)}%</span>
                </div>
                <div class="col-margin">
                    <span class="margin-badge ${isPositiveMargin ? 'positive' : 'negative'}">${marginSign}${product.margin_percentage}%</span>
                </div>
                <div class="col-actions">
                    <button class="btn-row btn-row-reject" data-action="reject" data-sku="${escapeHtml(product.sku)}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                        Rechazar
                    </button>
                    <button class="btn-row btn-row-accept" data-action="approve" data-sku="${escapeHtml(product.sku)}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Aprobar
                    </button>
                </div>
            </div>
        `;
    }

    function attachRowListeners(container) {
        // Checkbox listeners
        container.querySelectorAll('.row-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const sku = e.target.dataset.sku;
                const row = e.target.closest('.product-row');

                if (e.target.checked) {
                    selectedSkus.add(sku);
                    row.classList.add('selected');
                } else {
                    selectedSkus.delete(sku);
                    row.classList.remove('selected');
                }

                updateSelectionUI();
            });
        });

        // Action button listeners
        container.querySelectorAll('.btn-row').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.currentTarget;
                const sku = button.dataset.sku;
                const action = button.dataset.action;
                const decision = action === 'approve' ? 'approved' : 'rejected';

                button.disabled = true;

                const row = button.closest('.product-row');
                if (row) {
                    row.classList.add(action === 'approve' ? 'approved-exit' : 'rejected-exit');
                }

                setTimeout(async () => {
                    const success = await submitDecision(sku, decision);
                    if (success) {
                        const actionText = decision === 'approved' ? 'Precio aceptado' : 'Precio rechazado';
                        showToast(`${actionText} - ${sku}`, decision === 'approved' ? 'success' : 'error');
                        renderVisibleRows();
                        updateSelectionUI();
                        loadStats();
                    }
                }, 300);
            });
        });
    }

    // ============ BULK ACTIONS ============
    function setupBulkActions() {
        // Select All checkbox
        selectAllCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                products.forEach(p => selectedSkus.add(p.sku));
            } else {
                selectedSkus.clear();
            }
            renderVisibleRows();
            updateSelectionUI();
        });

        // Bulk Accept
        bulkAcceptBtn.addEventListener('click', () => {
            handleBulkAction('approve');
        });

        // Bulk Reject
        bulkRejectBtn.addEventListener('click', () => {
            handleBulkAction('reject');
        });

        // Initialize Confirmation Modal
        setupConfirmationModal();
    }

    // Modal elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmList = document.getElementById('confirm-list');
    const btnCancelConfirm = document.getElementById('btn-cancel-confirm');
    const btnCloseConfirm = document.getElementById('btn-close-confirm');
    const btnConfirmAction = document.getElementById('btn-confirm-action');

    let pendingBulkAction = null;

    function setupConfirmationModal() {
        if (!confirmModal) return;

        [btnCancelConfirm, btnCloseConfirm].forEach(btn => {
            if (btn) btn.addEventListener('click', closeConfirmModal);
        });

        if (btnConfirmAction) {
            btnConfirmAction.addEventListener('click', executePendingBulkAction);
        }
    }

    function openConfirmModal(action, skus) {
        if (!confirmModal) return;

        const isApprove = action === 'approve';
        const count = skus.length;
        const actionText = isApprove ? 'Aprobar' : 'Rechazar';

        // Update Modal Content
        confirmTitle.textContent = `¿${actionText} ${count} productos?`;
        confirmMessage.textContent = `Estás a punto de ${isApprove ? 'aprobar' : 'rechazar'} los siguientes productos:`;

        // Populate List
        confirmList.innerHTML = '';
        skus.forEach(sku => {
            const product = products.find(p => p.sku === sku);
            if (product) {
                const li = document.createElement('li');
                li.className = 'confirm-item';
                li.innerHTML = `
                    <span class="confirm-sku">${sku}</span>
                    <span class="confirm-name">${product.name}</span>
                `;
                confirmList.appendChild(li);
            }
        });

        // Button Styling
        if (isApprove) {
            btnConfirmAction.textContent = 'Aprobar';
            btnConfirmAction.className = 'btn-primary'; // Greenish
        } else {
            btnConfirmAction.textContent = 'Rechazar';
            btnConfirmAction.className = 'btn-primary btn-danger'; // Reddish
        }

        pendingBulkAction = { action, skus };
        confirmModal.classList.add('show');
    }

    function closeConfirmModal() {
        confirmModal.classList.remove('show');
        pendingBulkAction = null;
    }

    async function executePendingBulkAction() {
        if (!pendingBulkAction) return;

        const { action, skus } = pendingBulkAction;
        const decision = action === 'approve' ? 'approved' : 'rejected';

        closeConfirmModal();

        // UI Feedback
        bulkAcceptBtn.disabled = true;
        bulkRejectBtn.disabled = true;

        const count = await submitBulkDecision(skus, decision);

        if (action === 'approve') {
            showToast(`${count} precios aprobados`, 'success');
        } else {
            showToast(`${count} precios rechazados`, 'error');
        }

        selectedSkus.clear();
        renderVisibleRows();
        updateSelectionUI();
        loadStats();
    }

    function handleBulkAction(action) {
        if (selectedSkus.size === 0) return;
        const skusToProcess = [...selectedSkus];

        // If only 1 item, execute immediately (fast track)
        if (skusToProcess.length === 1) {
            pendingBulkAction = { action, skus: skusToProcess };
            executePendingBulkAction();
            return;
        }

        // otherwise show modal
        openConfirmModal(action, skusToProcess);
    }
    function updateSelectionUI() {
        const count = selectedSkus.size;

        selectedCountEl.textContent = `${count} seleccionado${count !== 1 ? 's' : ''}`;

        bulkAcceptBtn.disabled = count === 0;
        bulkRejectBtn.disabled = count === 0;

        // Update select all checkbox state
        if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (count === products.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
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

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

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
            // Restaurar todos los productos del conjunto
            const undoPromises = lastAction.products.map(product =>
                fetch(`${API_BASE}/undo`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sku: product.sku })
                })
            );

            const responses = await Promise.all(undoPromises);
            const allSuccess = responses.every(r => r.ok);

            if (allSuccess) {
                // Re-agregar todos los productos
                lastAction.products.forEach(product => {
                    products.unshift(product);
                });

                renderVisibleRows();
                loadStats();

                const count = lastAction.products.length;
                if (count === 1) {
                    showToast(`Deshecho: ${lastAction.products[0].sku} volvió a pendientes`, 'success');
                } else {
                    showToast(`Deshecho: ${count} productos volvieron a pendientes`, 'success');
                }

                lastAction = null;
                hideUndoButton();
            }
        } catch (error) {
            console.error('Error undoing action:', error);
            showToast('Error al deshacer', 'error');
        }
    }
    // ============ DRAG SELECTION ============
    function setupDragSelection() {
        const container = document.querySelector('.container');
        const selectionArea = document.getElementById('selection-area');

        if (!container || !selectionArea) return;

        let currentMousePos = { x: 0, y: 0 };
        let autoScrollInterval = null;
        const SCROLL_SPEED = 15;
        const SCROLL_ZONE = 60;

        container.addEventListener('mousedown', (e) => {
            if (e.target.closest('.btn-row, .checkbox-wrapper, button, input')) return;
            if (e.button !== 0) return;

            isDragging = true;
            dragStart = { x: e.clientX, y: e.clientY + window.scrollY };
            currentMousePos = { x: e.clientX, y: e.clientY };
            selectionBeforeDrag = new Set(selectedSkus);

            container.classList.add('selecting');
            selectionArea.classList.add('active');

            updateSelectionRect();
            startAutoScroll();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            currentMousePos = { x: e.clientX, y: e.clientY };
            updateSelectionRect();
            selectRowsInRect();
        });

        window.addEventListener('scroll', () => {
            if (!isDragging) return;
            updateSelectionRect();
            selectRowsInRect();
        }, { passive: true });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            stopAutoScroll();
            container.classList.remove('selecting');
            selectionArea.classList.remove('active');
            selectionArea.style.width = '0';
            selectionArea.style.height = '0';
            document.querySelectorAll('.product-row.drag-hover').forEach(row => {
                row.classList.remove('drag-hover');
            });
            updateSelectionUI();
            renderVisibleRows();
        });

        function startAutoScroll() {
            if (autoScrollInterval) return;
            autoScrollInterval = setInterval(() => {
                if (!isDragging) { stopAutoScroll(); return; }
                const vh = window.innerHeight;
                if (currentMousePos.y > vh - SCROLL_ZONE) {
                    window.scrollBy(0, Math.min(SCROLL_SPEED, (currentMousePos.y - (vh - SCROLL_ZONE)) / 2));
                } else if (currentMousePos.y < SCROLL_ZONE + 150) {
                    window.scrollBy(0, -Math.min(SCROLL_SPEED, (SCROLL_ZONE + 150 - currentMousePos.y) / 2));
                }
            }, 16);
        }

        function stopAutoScroll() {
            if (autoScrollInterval) { clearInterval(autoScrollInterval); autoScrollInterval = null; }
        }

        function updateSelectionRect() {
            const currentY = currentMousePos.y + window.scrollY;
            const left = Math.min(dragStart.x, currentMousePos.x);
            const top = Math.min(dragStart.y, currentY) - window.scrollY;
            const width = Math.abs(currentMousePos.x - dragStart.x);
            const height = Math.abs(currentY - dragStart.y);
            selectionArea.style.left = `${left}px`;
            selectionArea.style.top = `${top}px`;
            selectionArea.style.width = `${width}px`;
            selectionArea.style.height = `${height}px`;
        }

        function selectRowsInRect() {
            const selectionRect = selectionArea.getBoundingClientRect();
            const rows = document.querySelectorAll('.product-row');
            rows.forEach(row => {
                const rowRect = row.getBoundingClientRect();
                const sku = row.dataset.sku;
                const intersects = !(
                    rowRect.right < selectionRect.left ||
                    rowRect.left > selectionRect.right ||
                    rowRect.bottom < selectionRect.top ||
                    rowRect.top > selectionRect.bottom
                );
                if (intersects && selectionRect.width > 5 && selectionRect.height > 5) {
                    selectedSkus.add(sku);
                    row.classList.add('drag-hover', 'selected');
                } else {
                    row.classList.remove('drag-hover');
                    if (selectedSkus.has(sku)) row.classList.add('selected');
                }
            });
            updateSelectionUI();
        }
    }

    // ============ EXPORT MODAL LOGIC ============
    const exportModal = document.getElementById('export-modal');
    const btnCloseExport = document.getElementById('btn-close-export');
    const btnCancelExport = document.getElementById('btn-cancel-export');
    const btnDoExport = document.getElementById('btn-do-export');
    const exportStart = document.getElementById('export-start');
    const exportEnd = document.getElementById('export-end');
    const presetBtns = document.querySelectorAll('.btn-preset');

    function setupExportModal() {
        if (!exportModal) return;

        [btnCloseExport, btnCancelExport].forEach(btn => {
            if (btn) btn.addEventListener('click', () => exportModal.classList.remove('show'));
        });

        if (presetBtns) {
            presetBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // Update active state
                    presetBtns.forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');

                    // Set dates
                    const range = e.target.dataset.range;
                    setExportDates(range);
                });
            });
        }

        if (btnDoExport) {
            btnDoExport.addEventListener('click', handleExport);
        }
    }

    function openExportModal() {
        if (!exportModal) return;

        // Reset to "Today" by default
        setExportDates('today');
        presetBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.range === 'today');
        });

        exportModal.classList.add('show');
    }

    function setExportDates(range) {
        const today = new Date();
        const endDate = today.toISOString().split('T')[0];
        let startDate = endDate;

        if (range === '7days') {
            const past = new Date(today);
            past.setDate(today.getDate() - 7);
            startDate = past.toISOString().split('T')[0];
        } else if (range === 'month') {
            const past = new Date(today);
            past.setMonth(today.getMonth() - 1);
            startDate = past.toISOString().split('T')[0];
        }

        if (exportStart) exportStart.value = startDate;
        if (exportEnd) exportEnd.value = endDate;
    }

    function handleExport() {
        const start = exportStart.value;
        const end = exportEnd.value;

        if (!start || !end) {
            showToast('Por favor selecciona un rango de fechas', 'error');
            return;
        }

        exportModal.classList.remove('show');

        // Trigger download
        const link = document.createElement('a');
        link.href = `${API_BASE}/export/approvals?startDate=${start}&endDate=${end}`;
        link.download = `aprobaciones_${start}_${end}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Descarga iniciada', 'success');
    }

    // ============ START ============
    document.addEventListener('DOMContentLoaded', init);
})();


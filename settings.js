/**
 * UnaLuka Price Approval System - Settings & User Management
 */

(function () {
    'use strict';

    const API_BASE = 'http://localhost:3000/api';
    const SESSION_KEY = 'unaluka_session';
    let currentUser = null;

    // DOM Elements
    const btnSettings = document.getElementById('btn-settings');
    const modal = document.getElementById('settings-modal');
    const btnClose = document.getElementById('btn-close-modal');

    // Forms
    const changePassForm = document.getElementById('change-password-form');
    const createUserForm = document.getElementById('create-user-form');
    const adminSection = document.getElementById('admin-section');
    const tempPassDisplay = document.getElementById('temp-password-display');
    const tempPassCode = document.getElementById('temp-password-code');
    const userList = document.getElementById('user-list');

    // ============ AUTH HELPERS ============
    function getSessionToken() {
        return localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    }

    function getAuthHeaders() {
        const token = getSessionToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    // ============ INITIALIZATION ============
    function init() {
        loadUser();
        setupEventListeners();

        // Force modal open if password change is required
        if (currentUser && currentUser.mustChangePassword) {
            openModal(true);
            showToast('Debes cambiar tu contraseña temporal', 'info');
        }
    }

    function loadUser() {
        const storedUser = localStorage.getItem('unaluka_user') || sessionStorage.getItem('unaluka_user');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            if (currentUser.role === 'admin') {
                adminSection.style.display = 'block';
            }
        }
    }

    function setupEventListeners() {
        if (btnSettings) {
            btnSettings.addEventListener('click', () => {
                openModal();
                if (currentUser.role === 'admin') {
                    loadUsers();
                }
            });
        }

        if (btnClose) btnClose.addEventListener('click', () => closeModal());

        // Close on outside click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal && (!currentUser || !currentUser.mustChangePassword)) {
                    closeModal();
                }
            });
        }

        if (changePassForm) changePassForm.addEventListener('submit', handleChangePassword);
        if (createUserForm) createUserForm.addEventListener('submit', handleCreateUser);
    }

    // ============ MODAL ACTIONS ============
    function openModal(force = false) {
        modal.classList.add('show');
        if (force) {
            btnClose.style.display = 'none';
        }
    }

    function closeModal() {
        modal.classList.remove('show');
        tempPassDisplay.style.display = 'none';
        createUserForm.reset();
        changePassForm.reset();
    }

    // ============ PASSWORD ACTIONS ============
    async function handleChangePassword(e) {
        e.preventDefault();
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;

        try {
            const response = await fetch(`${API_BASE}/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await response.json();

            if (response.ok) {
                showToast('Contraseña actualizada correctamente', 'success');
                currentUser.mustChangePassword = false;

                // Update storage
                if (localStorage.getItem('unaluka_user')) {
                    localStorage.setItem('unaluka_user', JSON.stringify(currentUser));
                } else {
                    sessionStorage.setItem('unaluka_user', JSON.stringify(currentUser));
                }

                btnClose.style.display = 'block';
                closeModal();
            } else {
                showToast(data.error || 'Error al cambiar contraseña', 'error');
            }
        } catch (error) {
            showToast('Error de conexión', 'error');
        }
    }

    // ============ USER MANAGEMENT ACTIONS ============
    async function handleCreateUser(e) {
        e.preventDefault();
        const email = document.getElementById('user-email').value;
        const name = document.getElementById('user-name-input').value;

        try {
            const response = await fetch(`${API_BASE}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({ email, name })
            });

            const data = await response.json();

            if (response.ok) {
                showToast('Usuario creado correctamente', 'success');
                tempPassCode.textContent = data.tempPassword;
                tempPassDisplay.style.display = 'block';
                createUserForm.reset();
                loadUsers(); // Refresh list
            } else {
                showToast(data.error || 'Error al crear usuario', 'error');
            }
        } catch (error) {
            showToast('Error de conexión', 'error');
        }
    }

    async function loadUsers() {
        if (currentUser.role !== 'admin') return;

        try {
            const response = await fetch(`${API_BASE}/users`, {
                headers: getAuthHeaders()
            });

            if (response.ok) {
                const users = await response.json();
                renderUsers(users);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    function renderUsers(users) {
        userList.innerHTML = '';
        users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'user-item';

            const isMe = user.id === currentUser.id;
            const deleteBtn = !isMe ? `
                <button class="btn-delete-user" onclick="deleteUser(${user.id})" title="Eliminar usuario">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            ` : '';

            item.innerHTML = `
                <div class="user-item-info">
                    <span class="user-item-name">${user.name} ${isMe ? '(Tú)' : ''}</span>
                    <span class="user-item-email">${user.email}</span>
                </div>
                ${deleteBtn}
            `;
            userList.appendChild(item);
        });
    }

    // Expose delete function directly to window
    window.deleteUser = async function (userId) {
        if (!confirm('¿Estás seguro de eliminar este usuario?')) return;

        try {
            const response = await fetch(`${API_BASE}/users/${userId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (response.ok) {
                showToast('Usuario eliminado', 'success');
                loadUsers();
            } else {
                showToast('Error al eliminar usuario', 'error');
            }
        } catch (error) {
            showToast('Error de conexión', 'error');
        }
    };

    // Helper to show toasts (reusing app.js toast system if available)
    function showToast(message, type) {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            alert(message);
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();

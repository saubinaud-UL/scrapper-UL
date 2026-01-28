/**
 * UnaLuka Login Page - Authentication Logic
 */

(function () {
    'use strict';

    const API_BASE = 'http://localhost:3000/api';
    const SESSION_KEY = 'unaluka_session';

    // DOM Elements
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const rememberCheckbox = document.getElementById('remember');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const errorMessage = document.getElementById('error-message');
    const btnLogin = document.getElementById('btn-login');

    // Check if already logged in
    function checkExistingSession() {
        const session = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
        const expiresAt = localStorage.getItem('unaluka_expires') || sessionStorage.getItem('unaluka_expires');

        if (session) {
            // Check client-side expiration first
            if (expiresAt && Date.now() > parseInt(expiresAt)) {
                // Session expired, clear storage
                clearStorage();
                return;
            }

            // Verify token is still valid with server
            verifyToken(session).then(valid => {
                if (valid) {
                    window.location.href = '/index.html';
                } else {
                    clearStorage();
                }
            });
        }
    }

    function clearStorage() {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('unaluka_user');
        localStorage.removeItem('unaluka_expires');
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem('unaluka_user');
        sessionStorage.removeItem('unaluka_expires');
    }

    // Verify token with backend
    async function verifyToken(token) {
        try {
            const response = await fetch(`${API_BASE}/verify`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    // Toggle password visibility
    function setupPasswordToggle() {
        if (!togglePasswordBtn) return;

        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;

            const eyeOpen = togglePasswordBtn.querySelector('.eye-open');
            const eyeClosed = togglePasswordBtn.querySelector('.eye-closed');

            if (type === 'text') {
                eyeOpen.style.display = 'none';
                eyeClosed.style.display = 'block';
            } else {
                eyeOpen.style.display = 'block';
                eyeClosed.style.display = 'none';
            }
        });
    }

    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
    }

    // Hide error message
    function hideError() {
        errorMessage.classList.remove('show');
    }

    // Set loading state
    function setLoading(loading) {
        btnLogin.disabled = loading;
        btnLogin.classList.toggle('loading', loading);
    }

    // Handle form submission
    async function handleSubmit(e) {
        e.preventDefault();
        hideError();

        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const remember = rememberCheckbox.checked;

        // Basic validation
        if (!email || !password) {
            showError('Por favor completa todos los campos');
            return;
        }

        if (!isValidEmail(email)) {
            showError('Por favor ingresa un correo válido');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, remember })
            });

            const data = await response.json();

            if (response.ok) {
                // Use sessionStorage by default, localStorage only with "remember me"
                const storage = remember ? localStorage : sessionStorage;

                // Store session token
                storage.setItem(SESSION_KEY, data.token);

                // Store user info
                storage.setItem('unaluka_user', JSON.stringify(data.user));

                // Store expiration time for client-side check
                storage.setItem('unaluka_expires', data.expiresAt.toString());

                // Redirect to main app
                window.location.href = '/index.html';
            } else {
                showError(data.error || 'Credenciales incorrectas');
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Error de conexión. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    }

    // Email validation
    function isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Initialize
    function init() {
        checkExistingSession();
        setupPasswordToggle();

        if (form) {
            form.addEventListener('submit', handleSubmit);
        }

        // Clear error on input
        [emailInput, passwordInput].forEach(input => {
            if (input) {
                input.addEventListener('input', hideError);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();

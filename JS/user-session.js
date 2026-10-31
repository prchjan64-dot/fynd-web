
(function () {
    'use strict';

    /* ---- Adjust these only if your PHP files live in a different folder ---- */
    var SESSION_URL = 'session.php';
    var LOGIN_URL   = 'signin.html';
    var LOGOUT_URL  = 'logout.php';
    /* ------------------------------------------------------------------------ */

    var CACHE_KEY   = 'fynd_user';
    var TAG         = '[user-session]';
    var currentUser = null;
    var bindings    = [];
    var dialog      = null;
    var dialogName  = null;
    var dialogEmail = null;
    var cancelBtn   = null;
    var lastTrigger = null;

    console.info(TAG, 'script loaded');

    if (location.protocol === 'file:') {
        console.warn(TAG, 'This page was opened as file://. PHP sessions only work when the page is served by your PHP server, e.g. http://localhost/your-folder/Seller-Studio.html');
    }

    /* ---------- helpers ---------- */

    function readCache() {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function writeCache(user) {
        try {
            if (user) { sessionStorage.setItem(CACHE_KEY, JSON.stringify(user)); }
            else      { sessionStorage.removeItem(CACHE_KEY); }
        } catch (e) { /* storage unavailable - ignore */ }
    }

    function firstName(name) {
        name = String(name || '').trim();
        return name ? name.split(/\s+/)[0] : '';
    }

    function initialOf(name) {
        name = String(name || '').trim();
        return name ? name.charAt(0).toUpperCase() : '?';
    }

    function greetingText() {
        var h = new Date().getHours();
        if (h < 12) { return 'Good morning'; }
        if (h < 18) { return 'Good afternoon'; }
        return 'Good evening';
    }

    function requiresLogin() {
        return document.body && document.body.hasAttribute('data-require-login');
    }

    /* ---------- fill the page with the user's details ---------- */

    var DEFS = [
        { attr: 'data-user-first',    get: function (u) { return firstName(u.name); } },
        { attr: 'data-user-full',     get: function (u) { return u.name || ''; } },
        { attr: 'data-user-email',    get: function (u) { return u.email || ''; } },
        { attr: 'data-user-initial',  get: function (u) { return initialOf(u.name); } },
        { attr: 'data-user-greeting', get: function ()  { return greetingText(); } }
    ];

    function bindElement(el, getter) {
        var binding = {
            el: el,
            apply: function () {
                if (!currentUser) { return; }
                var value = getter(currentUser);
                if (el.textContent !== value) { el.textContent = value; }
            }
        };
        bindings.push(binding);

        /* If another script rewrites this element later, put the right value back. */
        if (window.MutationObserver) {
            new MutationObserver(function () { binding.apply(); })
                .observe(el, { childList: true, characterData: true, subtree: true });
        }
    }

    function collect() {
        DEFS.forEach(function (def) {
            var nodes = document.querySelectorAll('[' + def.attr + ']');
            Array.prototype.forEach.call(nodes, function (el) {
                if (el.__fyndBound) { return; }
                el.__fyndBound = true;
                bindElement(el, def.get);
            });
        });
    }

    function render(user) {
        currentUser = user;
        collect();
        bindings.forEach(function (b) { b.apply(); });
        console.info(TAG, 'rendered for', user.name, '(' + bindings.length + ' elements bound)');
    }

    /* ---------- logout confirmation ---------- */

    function make(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text)      { node.textContent = text; }
        return node;
    }

    function buildDialog() {
        dialog = document.createElement('dialog');
        dialog.className = 'logout-dialog';
        dialog.id = 'logout-dialog';
        dialog.setAttribute('aria-labelledby', 'logout-dialog-title');

        var body = make('div', 'logout-dialog-body');

        body.appendChild(make('p', 'logout-dialog-eyebrow', 'ACCOUNT'));

        var title = make('h3', 'logout-dialog-title', 'Log out of FYND?');
        title.id = 'logout-dialog-title';
        body.appendChild(title);

        var text = make('p', 'logout-dialog-text');
        text.appendChild(document.createTextNode('You are signed in as '));
        dialogName = make('strong');
        text.appendChild(dialogName);
        dialogEmail = make('span', 'logout-dialog-email');
        text.appendChild(dialogEmail);
        text.appendChild(document.createTextNode('. You will need to sign in again to manage your orders and listings.'));
        body.appendChild(text);

        var actions = make('div', 'logout-dialog-actions');

        cancelBtn = make('button', 'logout-btn logout-btn-ghost', 'Stay signed in');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', function () { dialog.close(); });

        var confirmBtn = make('button', 'logout-btn logout-btn-primary', 'Log out');
        confirmBtn.type = 'button';
        confirmBtn.addEventListener('click', doLogout);

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        body.appendChild(actions);

        dialog.appendChild(body);

        dialog.addEventListener('click', function (e) {
            if (e.target === dialog) { dialog.close(); }
        });

        dialog.addEventListener('close', function () {
            if (lastTrigger && lastTrigger.focus) { lastTrigger.focus(); }
        });

        document.body.appendChild(dialog);
    }

    function doLogout() {
        writeCache(null);
        window.location.href = LOGOUT_URL;
    }

    function openLogout() {
        if (typeof HTMLDialogElement === 'undefined') {
            if (window.confirm('Do you want to log out?')) { doLogout(); }
            return;
        }
        if (!dialog) { buildDialog(); }

        var user = currentUser || {};
        dialogName.textContent  = user.name || 'your account';
        dialogEmail.textContent = user.email ? ' (' + user.email + ')' : '';

        if (!dialog.open) { dialog.showModal(); }
        cancelBtn.focus();
    }

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest ? e.target.closest('[data-logout-trigger]') : null;
        if (!trigger) { return; }
        e.preventDefault();
        lastTrigger = trigger;
        openLogout();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== ' ') { return; }
        var trigger = e.target.closest ? e.target.closest('[data-logout-trigger]') : null;
        if (!trigger) { return; }
        e.preventDefault();
        lastTrigger = trigger;
        openLogout();
    });

    /* ---------- ask the server who is logged in ---------- */

    function refresh() {
        return fetch(SESSION_URL, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        })
        .then(function (res) {
            if (!res.ok) {
                throw new Error('session.php returned HTTP ' + res.status + ' - check the file exists in the same folder as this page.');
            }
            return res.text();
        })
        .then(function (text) {
            var data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error('session.php did not return JSON. It returned: ' + text.slice(0, 120));
            }

            console.info(TAG, 'session.php says:', data);

            if (data && data.loggedIn && data.user) {
                writeCache(data.user);
                render(data.user);
            } else {
                writeCache(null);
                console.warn(TAG, 'No logged-in user found in the PHP session.');
                if (requiresLogin()) { window.location.replace(LOGIN_URL); }
            }
        })
        .catch(function (err) {
            console.error(TAG, err.message || err);
        });
    }

    function init() {
        console.info(TAG, 'init');
        var cached = readCache();
        if (cached) { render(cached); }
        refresh();
    }

    window.addEventListener('pageshow', function (e) {
        if (e.persisted) { refresh(); }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
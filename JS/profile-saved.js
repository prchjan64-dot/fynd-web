(function () {
    'use strict';

    var TAG = '[saved]';
    var FAV_KEY = 'fynd_favorites';
    var CART_KEY = 'fynd_cart';
    var FAV_API = 'favorites.php';
    var CART_API = 'cart.php';

    /* ==================================================
       0. MAKE SURE THE PAGE HAS EVERYTHING THIS SCRIPT NEEDS
       (so it works even if profile.html was not fully updated)
    ================================================== */

    function findGrid() {
        var byId = document.getElementById('savedGrid');

        if (byId) {
            return byId;
        }

        var old = document.querySelector('#savedView .saved-products-grid') ||
            document.querySelector('.saved-products-grid');

        if (old) {
            old.id = 'savedGrid';
            old.setAttribute('aria-live', 'polite');
        }

        return old;
    }

    var grid = findGrid();

    if (!grid) {
        console.error(
            TAG,
            'Could not find the Saved tab grid (#savedGrid or .saved-products-grid). ' +
            'Check that profile.html contains the Saved view.'
        );
        return;
    }

    function ensureStylesheet(fileName, version) {
        if (document.querySelector('link[href*="' + fileName + '"]')) {
            return;
        }

        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'CSS/' + fileName + '?v=' + version;
        document.head.appendChild(link);
    }

    /* ---------- Product dialog (same markup as the storefront) ---------- */

    var DIALOG_HTML =
        '<dialog class="product-dialog" id="product-dialog" aria-labelledby="product-dialog-title">' +
        '<div class="product-dialog-body">' +
        '<a href="#saved" class="product-dialog-back" id="product-dialog-back">← Back to saved pieces</a>' +
        '<div class="product-dialog-media"><div class="product-dialog-image-wrap">' +
        '<img class="product-dialog-img" id="product-dialog-img" alt="">' +
        '<button type="button" class="product-dialog-favorite" id="product-dialog-favorite" ' +
        'aria-label="Remove from favorites" aria-pressed="true" title="Remove from favorites">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 14.6 8.8l5.9.9-4.25 4.15 1 5.85L12 16.9l-5.25 2.8 1-5.85L3.5 9.7l5.9-.9L12 3.5Z"></path></svg>' +
        '</button></div></div>' +
        '<div class="product-dialog-info">' +
        '<div class="product-dialog-meta">' +
        '<span class="product-dialog-badge" id="product-dialog-condition"></span>' +
        '<span class="product-dialog-category" id="product-dialog-category"></span></div>' +
        '<h2 class="product-dialog-title" id="product-dialog-title"></h2>' +
        '<p class="product-dialog-price" id="product-dialog-price"></p>' +
        '<p class="product-dialog-seller" id="product-dialog-seller"></p>' +
        '<div class="product-dialog-section"><h3 class="product-dialog-subtitle">Description</h3>' +
        '<p class="product-dialog-description" id="product-dialog-description"></p></div>' +
        '<p class="product-dialog-notice" id="product-dialog-notice" role="status" aria-live="polite" hidden></p>' +
        '<div class="product-dialog-actions">' +
        '<button type="button" class="product-dialog-add-cart" id="product-dialog-add-cart">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18"/>' +
        '<path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25"/>' +
        '<circle cx="18" cy="20" r="2"/><circle cx="8" cy="20" r="2"/></svg>' +
        '<span>Add to cart</span></button>' +
        '<button type="button" class="product-dialog-buy" id="product-dialog-buy">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/>' +
        '<path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/></svg>' +
        '<span>Buy item</span></button>' +
        '</div></div></div></dialog>';

    function ensureDialog() {
        if (document.getElementById('product-dialog')) {
            return;
        }

        document.body.insertAdjacentHTML('beforeend', DIALOG_HTML);
    }

    /* ---------- Checkout dialog ("Buy item" page) ----------
       Same markup as the storefront checkout (Fynd2.html).
       There is no quantity selector: an order is always 1 item. */

    var CHECKOUT_HTML =
        '<dialog class="checkout-dialog" id="checkout-dialog" aria-labelledby="checkout-title">' +
        '<div class="checkout-dialog-body">' +
        '<div class="checkout-dialog-topbar">' +
        '<button type="button" class="checkout-back" id="checkout-back">← Back to item</button>' +
        '<button type="button" class="checkout-close" id="checkout-close" aria-label="Close checkout">&times;</button>' +
        '</div>' +
        '<div class="checkout-layout">' +
        '<section class="checkout-product">' +
        '<div class="checkout-image-wrap"><img id="checkout-image" src="" alt="Selected product"></div>' +
        '<div class="checkout-product-details">' +
        '<p class="checkout-eyebrow">YOUR SELECTED ITEM</p>' +
        '<h2 id="checkout-product-name">Product name</h2>' +
        '<p class="checkout-price" id="checkout-product-price">₱0.00</p>' +
        '<div class="checkout-seller-line"><span>Seller</span>' +
        '<strong id="checkout-product-seller">Seller name</strong></div>' +
        '<div class="checkout-description"><h3>Description</h3>' +
        '<p id="checkout-product-description">Product description</p></div>' +
        '</div></section>' +
        '<aside class="checkout-summary">' +
        '<p class="checkout-summary-eyebrow">ORDER</p>' +
        '<h2 id="checkout-title">Summary</h2>' +
        '<div class="summary-row"><span>Subtotal</span><strong id="summary-subtotal">₱0.00</strong></div>' +
        '<div class="summary-row"><span>Estimated shipping</span><strong id="summary-shipping">₱80.00</strong></div>' +
        '<div class="summary-row"><span>Service fee</span><strong id="summary-service">₱20.00</strong></div>' +
        '<div class="summary-divider"></div>' +
        '<div class="summary-total"><span>Total</span><strong id="summary-total">₱100.00</strong></div>' +
        '<p class="summary-note">Shipping and service fees are estimates.</p>' +
        '<button type="button" class="checkout-submit" id="checkout-submit">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12.5 19H4a2 2 0 01-2-2V7a2 2 0 012-2h16a2 2 0 012 2v4"/>' +
        '<path d="M2 10h20"/><path d="M6 14h2"/><path d="m16 17 2 2 4-4"/></svg>' +
        '<span>Checkout</span></button>' +
        '<p class="checkout-status" id="checkout-status" role="status" aria-live="polite"></p>' +
        '</aside>' +
        '</div></div></dialog>';

    function ensureCheckoutDialog() {
        if (document.getElementById('checkout-dialog')) {
            return;
        }

        document.body.insertAdjacentHTML('beforeend', CHECKOUT_HTML);
    }

    /* The "Saved pieces" number on the Profile tab. */
    function ensureCount() {
        if (document.getElementById('savedCount')) {
            return;
        }

        var cards = document.querySelectorAll('.stat-card');

        for (var i = 0; i < cards.length; i += 1) {
            var label = cards[i].querySelector('p');
            var number = cards[i].querySelector('.stat-number');

            if (label && number && /saved pieces/i.test(label.textContent)) {
                number.id = 'savedCount';
                return;
            }
        }
    }

    /* The "Saved for later" preview on the Profile tab. */
    function ensurePreview() {
        if (document.getElementById('savedPreviewList')) {
            return;
        }

        var panel = document.querySelector('.saved-panel');

        if (!panel) {
            return;
        }

        var holder = document.createElement('div');
        holder.id = 'savedPreviewList';

        var rows = panel.querySelectorAll('.saved-item');

        if (rows.length) {
            rows[0].parentNode.insertBefore(holder, rows[0]);

            for (var i = 0; i < rows.length; i += 1) {
                rows[i].parentNode.removeChild(rows[i]);
            }
        } else {
            var action = panel.querySelector('.saved-action');

            if (action) {
                panel.insertBefore(holder, action);
            } else {
                panel.appendChild(holder);
            }
        }
    }

    /* The checkout ("Buy item") styles now live inside profile-saved.css,
       so profile-checkout.css is no longer loaded. */
    ensureStylesheet('profile-saved.css', 5);
    ensureDialog();
    ensureCheckoutDialog();
    ensureCount();
    ensurePreview();

    /* ==================================================
       1. FORMATTING (same as the storefront)
    ================================================== */

    var money0 = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });

    var money2 = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function formatPrice(value) {
        return Number.isInteger(value)
            ? money0.format(value)
            : money2.format(value);
    }

    function peso(amount) {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
            minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    var PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">' +
        '<rect width="400" height="400" fill="#ece9e4"/>' +
        '<g fill="none" stroke="#a8a39b" stroke-width="10" ' +
        'stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="110" y="140" width="180" height="120" rx="18"/>' +
        '<circle cx="165" cy="190" r="14"/>' +
        '<path d="m290 240-45-45-70 65"/>' +
        '</g></svg>'
    );

    var STAR_SVG =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M12 3.5 14.6 8.8l5.9.9-4.25 4.15 1 5.85L12 16.9l-5.25 2.8 1-5.85L3.5 9.7l5.9-.9L12 3.5Z"></path>' +
        '</svg>';

    var EMPTY_DESCRIPTION =
        'The seller has not added a description for this item yet.';

    function el(tag, className, text) {
        var node = document.createElement(tag);

        if (className) {
            node.className = className;
        }

        if (text !== undefined && text !== null) {
            node.textContent = text;
        }

        return node;
    }

    /* Makes sure every saved item has all the fields the card needs. */
    function normalize(raw) {
        return {
            id: String(raw.id),
            title: String(raw.title || raw.name || ''),
            category: String(raw.category || 'Other'),
            size: raw.size ? String(raw.size) : '',
            description: raw.description ? String(raw.description) : '',
            price: Number(raw.price) || 0,
            condition: String(raw.condition || 'Good'),
            image: raw.image ? String(raw.image) : '',
            seller: raw.seller ? String(raw.seller) : ''
        };
    }

    /* ==================================================
       2. SAVED ITEMS
       Logged in -> loaded from / saved to MySQL (favorites.php).
       Not logged in -> browser storage, like before.
    ================================================== */

    var saved = [];          /* current saved items, newest first */
    var mode = 'server';     /* 'server' or 'local' */
    var loadError = '';
    var lastError = '';
    var busy = false;
    var refreshing = false;

    /* Calls a PHP endpoint and returns the parsed JSON.
       On failure it throws an Error with .status (HTTP code). */
    function api(url, options) {
        options = options || {};

        var init = {
            method: options.method || 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        };

        if (options.body !== undefined) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(options.body);
        }

        return fetch(url, init).then(function (res) {
            return res.text().then(function (text) {
                var data;

                try {
                    data = JSON.parse(text);
                } catch (e) {
                    var parseError = new Error(
                        url + ' did not return JSON. It returned: ' + text.slice(0, 120)
                    );
                    parseError.status = res.status;
                    throw parseError;
                }

                if (!res.ok || !data || data.ok !== true) {
                    var message = (data && data.error) || ('HTTP ' + res.status);

                    if (data && data.detail) {
                        message += ' (' + data.detail + ')';
                    }

                    var apiError = new Error(message);
                    apiError.status = res.status;
                    throw apiError;
                }

                return data;
            });
        });
    }

    /* ---------- Browser storage (only used when not logged in) ---------- */

    function readLocalFavorites() {
        try {
            var data = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');

            if (!Array.isArray(data)) {
                return [];
            }

            return data
                .filter(function (item) {
                    return item && item.id !== undefined && item.id !== null;
                })
                .map(normalize);
        } catch (e) {
            return [];
        }
    }

    function writeLocalFavorites(items) {
        try {
            localStorage.setItem(FAV_KEY, JSON.stringify(items));
            return true;
        } catch (e) {
            return false;
        }
    }

    /* Returns true (now saved), false (removed) or null (could not save). */
    function toggleLocalFavorite(p) {
        var items = readLocalFavorites();
        var found = -1;

        for (var i = 0; i < items.length; i += 1) {
            if (items[i].id === String(p.id)) {
                found = i;
                break;
            }
        }

        if (found !== -1) {
            items.splice(found, 1);
            return writeLocalFavorites(items) ? false : null;
        }

        items.push(normalize(p));
        return writeLocalFavorites(items) ? true : null;
    }

    function readLocalCart() {
        try {
            var data = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

    function writeLocalCart(items) {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(items));
            return true;
        } catch (e) {
            return false;
        }
    }

    function addToLocalCart(p) {
        var items = readLocalCart();

        for (var i = 0; i < items.length; i += 1) {
            if (String(items[i].id) === String(p.id)) {
                return 'exists';
            }
        }

        items.push({
            id: p.id,
            name: p.title,
            shop: p.seller || 'a FYND seller',
            size: p.size || p.category,
            price: p.price,
            qty: 1,
            image: p.image
        });

        return writeLocalCart(items) ? 'added' : 'failed';
    }

    /* ---------- Saved list helpers ---------- */

    function isFavorite(id) {
        for (var i = 0; i < saved.length; i += 1) {
            if (saved[i].id === String(id)) {
                return true;
            }
        }

        return false;
    }

    function findSaved(id) {
        for (var i = 0; i < saved.length; i += 1) {
            if (saved[i].id === String(id)) {
                return saved[i];
            }
        }

        return null;
    }

    /* Resolves to true (now saved), false (removed) or null (failed).
       On failure the reason is in lastError. */
    function toggleFavorite(p) {
        lastError = '';

        if (mode === 'local') {
            var localResult = toggleLocalFavorite(p);

            if (localResult === null) {
                lastError = 'Could not save favorites in this browser.';
            } else {
                saved = readLocalFavorites().reverse();
            }

            return Promise.resolve(localResult);
        }

        var wasOn = isFavorite(p.id);

        return api(FAV_API, {
            method: 'POST',
            body: {
                action: wasOn ? 'remove' : 'add',
                product_id: Number(p.id)
            }
        })
            .then(function () {
                if (wasOn) {
                    saved = saved.filter(function (item) {
                        return item.id !== String(p.id);
                    });
                } else {
                    saved.unshift(normalize(p));
                }

                return !wasOn;
            })
            .catch(function (err) {
                console.error(TAG, err.message || err);
                lastError = err.message || 'Could not update your favorites.';
                return null;
            });
    }

    /* Resolves to 'added', 'exists' or 'failed' (reason in lastError). */
    function addToCart(p) {
        lastError = '';

        if (mode === 'local') {
            var localResult = addToLocalCart(p);

            if (localResult === 'failed') {
                lastError = 'Could not save to your cart. Please try again.';
            }

            return Promise.resolve(localResult);
        }

        return api(CART_API, {
            method: 'POST',
            body: {
                action: 'add',
                product_id: Number(p.id)
            }
        })
            .then(function (data) {
                return data.status === 'exists' ? 'exists' : 'added';
            })
            .catch(function (err) {
                console.error(TAG, err.message || err);
                lastError = err.message || 'Could not save to your cart. Please try again.';
                return 'failed';
            });
    }

    /* Favorites saved in this browser while logged out are moved into the account. */
    function mergeLocalFavorites() {
        var local = readLocalFavorites();

        if (!local.length) {
            return Promise.resolve();
        }

        var ids = [];

        local.forEach(function (p) {
            var n = parseInt(p.id, 10);

            if (n > 0) {
                ids.push(n);
            }
        });

        var request = ids.length
            ? api(FAV_API, {
                method: 'POST',
                body: { action: 'merge', product_ids: ids }
            })
            : Promise.resolve();

        return request
            .then(function () {
                try { localStorage.removeItem(FAV_KEY); } catch (e) { /* ignore */ }
            })
            .catch(function (err) {
                console.warn(TAG, 'Could not move browser favorites to your account:', err.message || err);
            });
    }

    /* Loads the saved list again (from MySQL, or from the browser when logged out). */
    function refresh() {
        if (refreshing) {
            return Promise.resolve();
        }

        refreshing = true;

        return api(FAV_API)
            .then(function (data) {
                mode = 'server';
                loadError = '';
                saved = (data.products || []).map(normalize);
            })
            .catch(function (err) {
                if (err.status === 401) {
                    mode = 'local';
                    loadError = '';
                    saved = readLocalFavorites().reverse();
                } else {
                    console.error(TAG, err.message || err);
                    loadError = err.message || 'Unknown error.';
                }
            })
            .then(function () {
                refreshing = false;
                render();
            });
    }

    function setFavoriteState(button, on) {
        if (!button) {
            return;
        }

        var label = on ? 'Remove from favorites' : 'Add to favorites';

        button.setAttribute('aria-pressed', on ? 'true' : 'false');
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
    }

    /* ==================================================
       2B. BANNER ("Added to favorites" / "Removed from favorites" / errors)
       Placed inside the open dialog (if there is one), because a modal
       dialog would otherwise cover it.
    ================================================== */

    var toastTimer = null;
    var toastHideTimer = null;

    function ensureToastStyle() {
        if (document.getElementById('fynd-toast-style')) {
            return;
        }

        var style = document.createElement('style');
        style.id = 'fynd-toast-style';
        style.textContent =
            '.fynd-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%);' +
            'z-index:2147483647;display:flex;align-items:center;gap:10px;' +
            'max-width:calc(100vw - 32px);padding:12px 22px;border-radius:999px;' +
            'background:#ffffff;color:#171717;border:1px solid rgba(23,23,23,.12);' +
            'font:600 14px/1.3 "Montserrat",system-ui,-apple-system,"Segoe UI",Arial,sans-serif;' +
            'box-shadow:0 10px 30px rgba(0,0,0,.28);pointer-events:none;' +
            'animation:fynd-toast-in .25s ease;}' +
            '.fynd-toast svg{display:block;width:18px;height:18px;flex-shrink:0;' +
            'fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round;}' +
            '.fynd-toast.is-on svg{fill:#f5c451;stroke:#171717;}' +
            '.fynd-toast.is-leaving{opacity:0;transform:translate(-50%,-8px);' +
            'transition:opacity .25s ease,transform .25s ease;}' +
            '@keyframes fynd-toast-in{from{opacity:0;transform:translate(-50%,-8px);}' +
            'to{opacity:1;transform:translate(-50%,0);}}' +
            '@media (prefers-reduced-motion:reduce){.fynd-toast{animation:none;}' +
            '.fynd-toast.is-leaving{transition:none;}}';

        document.head.appendChild(style);
    }

    function showToast(message, isOn) {
        ensureToastStyle();

        clearTimeout(toastTimer);
        clearTimeout(toastHideTimer);

        var old = document.querySelector('.fynd-toast');

        if (old && old.parentNode) {
            old.parentNode.removeChild(old);
        }

        var toast = document.createElement('div');
        toast.className = 'fynd-toast' + (isOn ? ' is-on' : '');
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.innerHTML = STAR_SVG;

        var text = document.createElement('span');
        text.textContent = message;
        toast.appendChild(text);

        var openDialogs = document.querySelectorAll('dialog[open]');
        var host = openDialogs.length
            ? openDialogs[openDialogs.length - 1]
            : document.body;

        host.appendChild(toast);

        toastTimer = setTimeout(function () {
            toast.classList.add('is-leaving');

            toastHideTimer = setTimeout(function () {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 2200);
    }

    function showFavoriteToast(isOn) {
        showToast(isOn ? 'Added to favorites' : 'Removed from favorites', isOn);
    }

    /* The Cart tab (JS/profile-cart.js) loads the cart itself. When an item is
       added here, ask it to reload. If it is not available, fall back to
       reloading the page once when the Cart tab is opened. */
    var cartDirty = false;

    function notifyCartChanged() {
        if (window.fyndCart && typeof window.fyndCart.reload === 'function') {
            window.fyndCart.reload();
        } else {
            cartDirty = true;
        }
    }

    /* ==================================================
       4. PRODUCT CARD (same markup as the storefront)
    ================================================== */

    function buildCard(p) {
        var article = el('article', 'product');

        var media = el('div', 'product-card-media');

        var link = el('a', 'product-image-link');
        link.href = '#';
        link.setAttribute('aria-label', 'View ' + p.title);

        var box = el('div', 'product-image-container');

        var img = el('img', 'product-img');
        img.alt = p.title;
        img.loading = 'lazy';

        img.addEventListener('error', function () {
            if (!img.getAttribute('data-fallback')) {
                img.setAttribute('data-fallback', '1');
                img.src = PLACEHOLDER;
            }
        });

        img.src = p.image || PLACEHOLDER;
        box.appendChild(img);

        link.appendChild(box);
        media.appendChild(link);

        var fav = el('button', 'product-dialog-favorite product-favorite');
        fav.type = 'button';
        fav.setAttribute('data-id', p.id);
        fav.innerHTML = STAR_SVG;
        setFavoriteState(fav, true);

        media.appendChild(fav);
        article.appendChild(media);

        var meta = el('div', 'product-meta');

        meta.appendChild(
            el(
                'span',
                p.condition === 'Like new' ? 'badge' : 'badge badge-preloved',
                p.condition
            )
        );

        meta.appendChild(
            el(
                'span',
                'product-category',
                p.category + (p.size ? ' · ' + p.size : '')
            )
        );

        article.appendChild(meta);
        article.appendChild(el('h3', 'product-name', p.title));

        var bottom = el('div', 'product-bottom');
        var info = el('div', 'product-price-info');

        info.appendChild(el('p', 'price', formatPrice(p.price)));
        info.appendChild(
            el('p', 'store-name', 'From ' + (p.seller || 'a FYND seller'))
        );

        bottom.appendChild(info);

        var add = el('button', 'product-add', '+');
        add.type = 'button';
        add.setAttribute('data-id', p.id);
        add.setAttribute('aria-haspopup', 'dialog');
        add.setAttribute('aria-label', 'View details of ' + p.title);

        bottom.appendChild(add);
        article.appendChild(bottom);

        return article;
    }

    /* ==================================================
       5. COUNT + PREVIEW ON THE PROFILE TAB
    ================================================== */

    function updateSummary(items) {
        var countEl = document.getElementById('savedCount');

        if (countEl) {
            countEl.textContent = String(items.length);
        }

        var list = document.getElementById('savedPreviewList');

        if (!list) {
            return;
        }

        list.textContent = '';

        if (items.length === 0) {
            list.appendChild(
                el(
                    'p',
                    'saved-preview-empty',
                    'Nothing saved yet. Tap the star on an item you like.'
                )
            );
            return;
        }

        items.slice(0, 2).forEach(function (p) {
            var row = el('div', 'saved-item');

            var thumb = el('div', 'saved-thumb');
            thumb.setAttribute('role', 'img');
            thumb.setAttribute('aria-label', p.title);

            if (p.image) {
                thumb.style.backgroundImage = 'url(' + JSON.stringify(p.image) + ')';
                thumb.style.backgroundSize = 'cover';
                thumb.style.backgroundPosition = 'center';
            }

            var details = el('div', 'saved-item-details');
            details.appendChild(el('strong', null, p.title));
            details.appendChild(
                el('span', null, p.seller || 'a FYND seller')
            );

            row.appendChild(thumb);
            row.appendChild(details);
            row.appendChild(el('strong', 'saved-price', formatPrice(p.price)));

            list.appendChild(row);
        });
    }

    /* ==================================================
       6. DIALOG ELEMENTS
    ================================================== */

    var productDialog = document.getElementById('product-dialog');
    var pdImage = document.getElementById('product-dialog-img');
    var pdCondition = document.getElementById('product-dialog-condition');
    var pdCategory = document.getElementById('product-dialog-category');
    var pdTitle = document.getElementById('product-dialog-title');
    var pdPrice = document.getElementById('product-dialog-price');
    var pdSeller = document.getElementById('product-dialog-seller');
    var pdDescription = document.getElementById('product-dialog-description');
    var pdBack = document.getElementById('product-dialog-back');
    var pdAddCart = document.getElementById('product-dialog-add-cart');
    var pdBuy = document.getElementById('product-dialog-buy');
    var pdNotice = document.getElementById('product-dialog-notice');
    var pdFavorite = document.getElementById('product-dialog-favorite');

    var checkoutDialog = document.getElementById('checkout-dialog');
    var checkoutBack = document.getElementById('checkout-back');
    var checkoutClose = document.getElementById('checkout-close');
    var checkoutSubmit = document.getElementById('checkout-submit');

    var currentProduct = null;

    /* The quantity selector was removed, so an order is always 1 item. */
    var checkoutQty = 1;

    /* Same fees as the storefront checkout. */
    var SHIPPING_FEE = 80;
    var SERVICE_FEE = 20;

    /* ==================================================
       7. RENDER THE SAVED TAB
    ================================================== */

    function render() {
        grid.textContent = '';

        if (saved.length === 0) {
            if (loadError) {
                grid.appendChild(
                    el(
                        'p',
                        'saved-empty',
                        'We could not load your saved pieces. ' + loadError
                    )
                );
            } else {
                var empty = el('p', 'saved-empty');
                empty.appendChild(
                    document.createTextNode('You have not saved any pieces yet. ')
                );

                var shop = el('a', null, 'Find something to love');
                shop.href = 'Fynd2.html#products';
                empty.appendChild(shop);

                grid.appendChild(empty);
            }
        } else {
            saved.forEach(function (p) {
                grid.appendChild(buildCard(p));
            });
        }

        updateSummary(saved);

        if (currentProduct && pdFavorite) {
            setFavoriteState(pdFavorite, isFavorite(currentProduct.id));
        }

        return saved.length;
    }

    /* ==================================================
       8. PRODUCT DIALOG BEHAVIOUR
    ================================================== */

    function showNotice(text, kind) {
        if (!pdNotice) {
            return;
        }

        pdNotice.textContent = text;
        pdNotice.className =
            'product-dialog-notice' + (kind ? ' is-' + kind : '');
        pdNotice.hidden = false;
    }

    function hideNotice() {
        if (!pdNotice) {
            return;
        }

        pdNotice.hidden = true;
        pdNotice.textContent = '';
    }

    function openProduct(p) {
        if (
            !productDialog ||
            typeof productDialog.showModal !== 'function'
        ) {
            return;
        }

        if (!pdImage || !pdCondition || !pdCategory ||
            !pdTitle || !pdPrice || !pdSeller || !pdDescription) {
            console.error(TAG, 'Some product dialog elements are missing.');
            return;
        }

        currentProduct = p;

        pdImage.removeAttribute('data-fallback');
        pdImage.alt = p.title;
        pdImage.src = p.image || PLACEHOLDER;

        pdCondition.textContent = p.condition;
        pdCondition.className =
            'product-dialog-badge' +
            (p.condition === 'Like new' ? '' : ' is-preloved');

        pdCategory.textContent =
            p.category + (p.size ? ' · ' + p.size : '');

        pdTitle.textContent = p.title;
        pdPrice.textContent = formatPrice(p.price);
        pdSeller.textContent = 'From ' + (p.seller || 'a FYND seller');

        if (p.description) {
            pdDescription.textContent = p.description;
            pdDescription.classList.remove('is-empty');
        } else {
            pdDescription.textContent = EMPTY_DESCRIPTION;
            pdDescription.classList.add('is-empty');
        }

        hideNotice();
        setFavoriteState(pdFavorite, isFavorite(p.id));

        if (!productDialog.open) {
            productDialog.showModal();
        }

        productDialog.scrollTop = 0;
    }

    /* ---------- Clicks on the Saved cards ---------- */

    grid.addEventListener('click', function (event) {
        /* Star: un-save the item (it disappears from the Saved tab). */
        var star = event.target.closest('.product-favorite');

        if (star) {
            event.preventDefault();

            if (busy) {
                return;
            }

            var starProduct = findSaved(star.getAttribute('data-id'));

            if (!starProduct) {
                return;
            }

            busy = true;

            toggleFavorite(starProduct).then(function (starResult) {
                busy = false;

                if (starResult === null) {
                    showToast(lastError || 'Could not update your favorites.', false);
                    return;
                }

                render();
                showFavoriteToast(starResult);
            });

            return;
        }

        /* + button or the photo: open the product dialog. */
        var opener = event.target.closest('.product-add, .product-image-link');

        if (!opener) {
            return;
        }

        event.preventDefault();

        var card = opener.closest('.product');
        var addBtn = card ? card.querySelector('.product-add') : null;
        var product = addBtn
            ? findSaved(addBtn.getAttribute('data-id'))
            : null;

        if (product) {
            openProduct(product);
        }
    });

    /* ---------- Product dialog buttons ---------- */

    if (productDialog && pdImage) {
        pdImage.addEventListener('error', function () {
            if (!pdImage.getAttribute('data-fallback')) {
                pdImage.setAttribute('data-fallback', '1');
                pdImage.src = PLACEHOLDER;
            }
        });

        if (pdBack) {
            pdBack.addEventListener('click', function (event) {
                event.preventDefault();
                productDialog.close();
            });
        }

        /* Star inside the dialog: save / un-save the open item. */
        if (pdFavorite) {
            pdFavorite.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                if (!currentProduct || busy) {
                    return;
                }

                busy = true;

                toggleFavorite(currentProduct).then(function (result) {
                    busy = false;

                    if (result === null) {
                        showNotice(
                            lastError || 'Could not update your favorites. Please try again.',
                            'error'
                        );
                        return;
                    }

                    setFavoriteState(pdFavorite, result);
                    render();
                    showFavoriteToast(result);
                });
            });
        }

        /* ADD TO CART: save the product and stay in the product dialog. */
        if (pdAddCart) {
            pdAddCart.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                if (!currentProduct) {
                    return;
                }

                addToCart(currentProduct).then(function (result) {
                    if (result === 'added') {
                        notifyCartChanged();
                        showNotice('Added to your cart.', 'success');
                    } else if (result === 'exists') {
                        showNotice('This item is already in your cart.');
                    } else {
                        showNotice(
                            lastError || 'Could not save to your cart. Please try again.',
                            'error'
                        );
                    }
                });
            });
        }

        /* BUY ITEM: open the checkout summary (same as the storefront).
           It does not add the item to the cart. */
        if (pdBuy) {
            pdBuy.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                if (!currentProduct) {
                    return;
                }

                openCheckout();
            });
        }

        productDialog.addEventListener('click', function (event) {
            if (event.target === productDialog) {
                productDialog.close();
            }
        });

        productDialog.addEventListener('close', function () {
            render();
        });
    }

    /* ==================================================
       9. CHECKOUT DIALOG (order summary, same as the storefront)
    ================================================== */

    function checkoutElement(id) {
        return document.getElementById(id);
    }

    function updateCheckoutSummary() {
        if (!currentProduct) {
            return;
        }

        var subtotal = currentProduct.price * checkoutQty;
        var total = subtotal + SHIPPING_FEE + SERVICE_FEE;

        var subtotalElement = checkoutElement('summary-subtotal');
        var shippingElement = checkoutElement('summary-shipping');
        var serviceElement = checkoutElement('summary-service');
        var totalElement = checkoutElement('summary-total');

        if (subtotalElement) {
            subtotalElement.textContent = peso(subtotal);
        }

        if (shippingElement) {
            shippingElement.textContent = peso(SHIPPING_FEE);
        }

        if (serviceElement) {
            serviceElement.textContent = peso(SERVICE_FEE);
        }

        if (totalElement) {
            totalElement.textContent = peso(total);
        }
    }

    function openCheckout() {
        if (!currentProduct) {
            return;
        }

        if (!checkoutDialog ||
            typeof checkoutDialog.showModal !== 'function') {
            showNotice('The checkout window could not be opened.', 'error');
            console.error(TAG, 'Missing #checkout-dialog.');
            return;
        }

        var checkoutImage = checkoutElement('checkout-image');
        var checkoutName = checkoutElement('checkout-product-name');
        var checkoutPrice = checkoutElement('checkout-product-price');
        var checkoutSeller = checkoutElement('checkout-product-seller');
        var checkoutDescription =
            checkoutElement('checkout-product-description');
        var checkoutTitle = checkoutElement('checkout-title');
        var checkoutStatus = checkoutElement('checkout-status');

        if (!checkoutImage || !checkoutName || !checkoutPrice ||
            !checkoutSeller || !checkoutDescription) {
            showNotice('Some checkout elements are missing.', 'error');
            console.error(TAG, 'One or more checkout product elements are missing.');
            return;
        }

        checkoutQty = 1;

        checkoutImage.removeAttribute('data-fallback');
        checkoutImage.src = currentProduct.image || PLACEHOLDER;
        checkoutImage.alt = currentProduct.title || 'Selected product';

        checkoutName.textContent =
            currentProduct.title || 'Untitled item';

        checkoutPrice.textContent = formatPrice(currentProduct.price);

        checkoutSeller.textContent =
            currentProduct.seller || 'a FYND seller';

        checkoutDescription.textContent =
            currentProduct.description || EMPTY_DESCRIPTION;

        if (checkoutTitle) {
            checkoutTitle.textContent = 'Order Summary';
        }

        if (checkoutStatus) {
            checkoutStatus.textContent = '';
        }

        updateCheckoutSummary();

        /* Switch dialogs: details closes, checkout opens. */
        if (productDialog && productDialog.open) {
            productDialog.close();
        }

        if (!checkoutDialog.open) {
            checkoutDialog.showModal();
        }

        checkoutDialog.scrollTop = 0;
    }

    if (checkoutDialog) {
        var checkoutImageForFallback = checkoutElement('checkout-image');

        if (checkoutImageForFallback) {
            checkoutImageForFallback.addEventListener('error', function () {
                if (!checkoutImageForFallback.getAttribute('data-fallback')) {
                    checkoutImageForFallback.setAttribute('data-fallback', '1');
                    checkoutImageForFallback.src = PLACEHOLDER;
                }
            });
        }

        if (checkoutBack) {
            checkoutBack.addEventListener('click', function (event) {
                event.preventDefault();
                checkoutDialog.close();

                if (productDialog && !productDialog.open) {
                    productDialog.showModal();
                }
            });
        }

        if (checkoutClose) {
            checkoutClose.addEventListener('click', function () {
                checkoutDialog.close();
            });
        }

        checkoutDialog.addEventListener('click', function (event) {
            if (event.target === checkoutDialog) {
                checkoutDialog.close();
            }
        });

        if (checkoutSubmit) {
            checkoutSubmit.addEventListener('click', function (event) {
                event.preventDefault();

                if (!currentProduct) {
                    return;
                }

                var total =
                    currentProduct.price * checkoutQty +
                    SHIPPING_FEE +
                    SERVICE_FEE;

                var checkoutStatus = checkoutElement('checkout-status');

                if (checkoutStatus) {
                    checkoutStatus.textContent =
                        'Order summary: ' + checkoutQty +
                        ' item(s), total ' + peso(total) +
                        '. Connect your order/payment process to complete the purchase.';
                }
            });
        }
    }

    /* ==================================================
       10. CART TAB + SAVED TAB
    ================================================== */

    /* Fallback only: if the Cart tab script is not available, reload once so it shows. */
    document.querySelectorAll('[data-view="cart"]').forEach(function (node) {
        node.addEventListener('click', function () {
            if (!cartDirty) {
                return;
            }

            cartDirty = false;

            try {
                window.history.replaceState(null, '', '#cart');
            } catch (e) { /* ignore */ }

            window.location.reload();
        });
    });

    /* Opening the Saved tab always shows the latest list. */
    document.querySelectorAll('[data-view="saved"]').forEach(function (node) {
        node.addEventListener('click', function () {
            refresh();
        });
    });

    /* ==================================================
       11. KEEP IN SYNC WITH THE STOREFRONT
    ================================================== */

    window.addEventListener('storage', function (event) {
        if (event.key === FAV_KEY) {
            refresh();
        }
    });

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            refresh();
        }
    });

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            refresh();
        }
    });

    /* ==================================================
       12. START
    ================================================== */

    grid.textContent = '';
    grid.appendChild(el('p', 'saved-empty', 'Loading your saved pieces…'));

    mergeLocalFavorites().then(refresh).then(function () {
        console.info(
            TAG,
            'ready - ' + saved.length + ' saved item(s) (' + mode + ' mode).'
        );
    });
})();
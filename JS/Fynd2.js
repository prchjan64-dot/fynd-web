(function () {
    'use strict';

    var API_URL = 'PHP/Get_products.php';
    var FAV_API = 'favorites.php';
    var CART_API = 'cart.php';
    var TAG = '[storefront]';
    var CHANGE_KEY = 'fynd:products-changed';
    var POLL_MS = 30000;

    /* Browser storage keys. They are only used for visitors who are NOT
       logged in. Logged-in users are saved in MySQL. */
    var FAV_KEY = 'fynd_favorites';
    var CART_KEY = 'fynd_cart';

    var grid = document.querySelector('.products-grid');
    if (!grid) {
        console.error(TAG, 'Could not find .products-grid.');
        return;
    }

    var filterButtons = Array.prototype.slice.call(
        document.querySelectorAll('.filter-btn[data-category]')
    );
    var searchInput = document.getElementById('product-search');

    var products = [];
    var activeCategory = 'all';
    var searchTerm = '';
    var state = 'loading';
    var errorText = '';
    var inFlight = false;

    var currentProduct = null;
    var favBusy = false;
    var cartBusy = false;

    /* Account state */
    var auth = { loggedIn: false };
    var favIds = {};      /* ids of the logged-in user's favorites */
    var lastError = '';   /* message of the last failed save */

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

    function normalize(raw) {
        return {
            id: String(raw.id),
            title: String(raw.title || ''),
            category: String(raw.category || 'Other'),
            size: raw.size ? String(raw.size) : '',
            description: raw.description ? String(raw.description) : '',
            price: Number(raw.price) || 0,
            condition: String(raw.condition || 'Good'),
            image: raw.image ? String(raw.image) : '',
            seller: raw.seller ? String(raw.seller) : ''
        };
    }

    /* ---------- SERVER HELPERS ---------- */

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

    function isLoggedIn() {
        return fetch('PHP/session.php', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
                'Accept': 'application/json'
            }
        })
            .then(function (res) {
                return res.json();
            })
            .then(function (data) {
                return !!(data && data.loggedIn === true);
            })
            .catch(function () {
                return false;
            });
    }

    /* ---------- FAVORITES: browser storage (visitors who are not logged in) ---------- */

    function readLocalFavorites() {
        try {
            var data = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
            return Array.isArray(data) ? data : [];
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

    function isLocalFavorite(id) {
        var items = readLocalFavorites();

        for (var i = 0; i < items.length; i += 1) {
            if (String(items[i].id) === String(id)) {
                return true;
            }
        }

        return false;
    }

    /* Returns true (now a favorite), false (removed) or null (could not save). */
    function toggleLocalFavorite(p) {
        var items = readLocalFavorites();
        var found = -1;

        for (var i = 0; i < items.length; i += 1) {
            if (String(items[i].id) === String(p.id)) {
                found = i;
                break;
            }
        }

        if (found !== -1) {
            items.splice(found, 1);
            return writeLocalFavorites(items) ? false : null;
        }

        items.push({
            id: p.id,
            title: p.title,
            category: p.category,
            size: p.size,
            description: p.description,
            price: p.price,
            condition: p.condition,
            image: p.image,
            seller: p.seller
        });

        return writeLocalFavorites(items) ? true : null;
    }

    /* ---------- FAVORITES: used by the page ---------- */

    function isFavorite(id) {
        if (auth.loggedIn) {
            return favIds[String(id)] === true;
        }

        return isLocalFavorite(id);
    }

    /* Resolves to true (now a favorite), false (removed) or null (failed).
       On failure the reason is in lastError. */
    function toggleFavorite(p) {
        lastError = '';

        return sessionReady.then(function () {
            if (!auth.loggedIn) {
                var localResult = toggleLocalFavorite(p);

                if (localResult === null) {
                    lastError = 'Could not save favorites in this browser.';
                }

                return localResult;
            }

            var key = String(p.id);
            var wasOn = favIds[key] === true;

            return api(FAV_API, {
                method: 'POST',
                body: {
                    action: wasOn ? 'remove' : 'add',
                    product_id: Number(p.id)
                }
            })
                .then(function () {
                    if (wasOn) {
                        delete favIds[key];
                    } else {
                        favIds[key] = true;
                    }

                    return !wasOn;
                })
                .catch(function (err) {
                    console.error(TAG, err.message || err);
                    lastError = err.message || 'Could not update your favorites.';
                    return null;
                });
        });
    }

    function loadServerFavorites() {
        return api(FAV_API).then(function (data) {
            favIds = {};

            (data.products || []).forEach(function (p) {
                favIds[String(p.id)] = true;
            });
        });
    }

    function refreshFavorites() {
        if (!auth.loggedIn) {
            return Promise.resolve();
        }

        return loadServerFavorites()
            .then(function () {
                syncFavoriteButtons();
            })
            .catch(function (err) {
                console.error(TAG, 'Could not refresh favorites:', err.message || err);
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

    /* Re-reads the favorites and updates every star on the page. */
    function syncFavoriteButtons() {
        var buttons = grid.querySelectorAll('.product-favorite');

        for (var i = 0; i < buttons.length; i += 1) {
            setFavoriteState(
                buttons[i],
                isFavorite(buttons[i].getAttribute('data-id'))
            );
        }

        var dialogStar = document.getElementById('product-dialog-favorite');

        if (dialogStar && currentProduct) {
            setFavoriteState(dialogStar, isFavorite(currentProduct.id));
        }
    }

    /* ---------- BANNER ("Added to favorites" and error messages) ----------
       Placed inside the open dialog (if there is one), because a modal
       dialog would otherwise cover it. */

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

    /* ---------- CART ---------- */

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

    /* Add-to-cart action is used ONLY by the Add to Cart button.
       Resolves to 'added', 'exists' or 'failed' (reason in lastError). */
    function addToCart(p) {
        lastError = '';

        return sessionReady.then(function () {
            if (!auth.loggedIn) {
                var localResult = addToLocalCart(p);

                if (localResult === 'failed') {
                    lastError = 'Could not save to your cart. Please try again.';
                }

                return localResult;
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
        });
    }

    /* ---------- MOVE BROWSER DATA INTO THE ACCOUNT ----------
       Runs once after login: favorites and cart items saved in this browser
       while logged out are copied to the database, then cleared here. */

    function mergeLocalData() {
        var tasks = [];

        var localFavs = readLocalFavorites();

        if (localFavs.length) {
            var favIdList = [];

            localFavs.forEach(function (item) {
                var n = parseInt(item && item.id, 10);

                if (n > 0) {
                    favIdList.push(n);
                }
            });

            var favRequest = favIdList.length
                ? api(FAV_API, {
                    method: 'POST',
                    body: { action: 'merge', product_ids: favIdList }
                })
                : Promise.resolve();

            tasks.push(
                favRequest
                    .then(function () {
                        try { localStorage.removeItem(FAV_KEY); } catch (e) { /* ignore */ }
                    })
                    .catch(function (err) {
                        console.warn(TAG, 'Could not move browser favorites to your account:', err.message || err);
                    })
            );
        }

        var localCart = readLocalCart();

        if (localCart.length) {
            var lines = [];

            localCart.forEach(function (item) {
                var n = parseInt(item && item.id, 10);

                if (n > 0) {
                    lines.push({
                        product_id: n,
                        quantity: parseInt(item.qty, 10) || 1
                    });
                }
            });

            var cartRequest = lines.length
                ? api(CART_API, {
                    method: 'POST',
                    body: { action: 'merge', items: lines }
                })
                : Promise.resolve();

            tasks.push(
                cartRequest
                    .then(function () {
                        try { localStorage.removeItem(CART_KEY); } catch (e) { /* ignore */ }
                    })
                    .catch(function (err) {
                        console.warn(TAG, 'Could not move browser cart to your account:', err.message || err);
                    })
            );
        }

        return Promise.all(tasks);
    }

    /* ---------- PRODUCT CARD ---------- */

    function buildCard(p) {
        var article = el('article', 'product');

        /* The star button is a SIBLING of the image link (not inside it),
           because a button inside a link is invalid HTML and would also
           open the product dialog when clicked. */
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

        /* Same icon and same CSS class as the star in the product dialog. */
        var fav = el('button', 'product-dialog-favorite product-favorite');
        fav.type = 'button';
        fav.setAttribute('data-id', p.id);
        fav.innerHTML = STAR_SVG;
        setFavoriteState(fav, isFavorite(p.id));

        media.appendChild(fav);
        article.appendChild(media);

        var meta = el('div', 'product-meta');

        meta.appendChild(
            el(
                'span',
                p.condition === 'Like new'
                    ? 'badge'
                    : 'badge badge-preloved',
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

    function message(text) {
        var p = el('p', 'products-message', text);
        p.style.cssText =
            'grid-column:1 / -1;text-align:center;padding:48px 16px;margin:0;opacity:.7;';
        return p;
    }

    /* CHANGED: small note shown above typo results. */
    function fuzzyNotice(text) {
        var p = el('p', 'products-message products-fuzzy-note', text);
        p.style.cssText =
            'grid-column:1 / -1;text-align:left;padding:0 2px 4px;margin:0;' +
            'font-size:13px;font-weight:500;color:#556F8F;';
        return p;
    }

    /* ---------- SEARCH + FILTER ----------
       - Text is lower-cased and punctuation is removed, so "T-shirts",
         "t shirt" and "tshirt" all match each other.
       - The search looks at: title, category, size, seller / shop name,
         condition and description.
       - Every word typed must be found (so "nike shoes" works).
       - While the search box has text, the category filter is IGNORED,
         so results come from ALL categories.

       CHANGED: if nothing matches exactly, a typo-tolerant search runs
       and shows the closest products / shops instead. */

    function cleanText(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')   /* remove accents */
            .replace(/[^a-z0-9]+/g, ' ')        /* punctuation -> space */
            .trim();
    }

    function searchWords() {
        if (!searchTerm) {
            return [];
        }

        return cleanText(searchTerm).split(' ').filter(Boolean);
    }

    /* EXACT match (same as before). */
    function matchesExact(p, words) {
        var spaced = cleanText(
            p.title + ' ' +
            p.category + ' ' +
            p.size + ' ' +
            p.seller + ' ' +
            p.condition + ' ' +
            p.description
        );

        var compact = spaced.replace(/\s+/g, '');

        for (var i = 0; i < words.length; i += 1) {
            if (spaced.indexOf(words[i]) === -1 &&
                compact.indexOf(words[i]) === -1) {
                return false;
            }
        }

        return true;
    }

    /* ----- Typo tolerance (fuzzy search) ----- */

    /* Number of edits (insert, delete, replace, swap two letters)
       needed to turn string a into string b. */
    function editDistance(a, b) {
        var al = a.length;
        var bl = b.length;

        if (!al) { return bl; }
        if (!bl) { return al; }

        var d = [];
        var i;
        var j;

        for (i = 0; i <= al; i += 1) {
            d[i] = [i];
        }

        for (j = 1; j <= bl; j += 1) {
            d[0][j] = j;
        }

        for (i = 1; i <= al; i += 1) {
            for (j = 1; j <= bl; j += 1) {
                var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;

                d[i][j] = Math.min(
                    d[i - 1][j] + 1,
                    d[i][j - 1] + 1,
                    d[i - 1][j - 1] + cost
                );

                if (i > 1 && j > 1 &&
                    a.charAt(i - 1) === b.charAt(j - 2) &&
                    a.charAt(i - 2) === b.charAt(j - 1)) {
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
                }
            }
        }

        return d[al][bl];
    }

    /* How many typos we forgive, depending on the word length. */
    function allowedTypos(length) {
        if (length <= 3) { return 0; }
        if (length <= 6) { return 1; }
        if (length <= 9) { return 2; }
        return 3;
    }

    /* All searchable words of a product (title, shop, category, ...).
       Also includes the title, shop and category written without spaces,
       so "tshrit" can still find "T-shirts". Saved on the product. */
    function getTokens(p) {
        if (p._tokens) {
            return p._tokens;
        }

        var text = cleanText(
            p.title + ' ' +
            p.category + ' ' +
            p.size + ' ' +
            p.seller + ' ' +
            p.condition + ' ' +
            p.description
        );

        var list = text.split(' ').filter(function (w) {
            return w.length >= 3;
        });

        [p.title, p.seller, p.category].forEach(function (field) {
            var compact = cleanText(field).replace(/\s+/g, '');

            if (compact.length >= 3) {
                list.push(compact);
            }
        });

        p._tokens = list;
        return list;
    }

    /* Typos between one typed word and one product word. */
    function wordDistance(word, token) {
        var distance = editDistance(word, token);

        /* "sneekr" should still find "sneakers": compare with the start too. */
        if (word.length >= 4 && token.length > word.length) {
            distance = Math.min(
                distance,
                editDistance(word, token.slice(0, word.length))
            );
        }

        return distance;
    }

    /* Returns a score (lower = closer) or null when the product is too far.
       requireAll = true  -> every typed word must be close to something.
       requireAll = false -> at least one typed word must be close. */
    function fuzzyScore(p, words, requireAll) {
        var tokens = getTokens(p);
        var total = 0;
        var matched = 0;
        var missed = 0;

        for (var w = 0; w < words.length; w += 1) {
            var word = words[w];
            var allowed = allowedTypos(word.length);
            var best = Infinity;

            for (var t = 0; t < tokens.length; t += 1) {
                var d = wordDistance(word, tokens[t]);

                if (d < best) {
                    best = d;
                }

                if (best === 0) {
                    break;
                }
            }

            if (best <= allowed) {
                matched += 1;
                total += best;
            } else {
                missed += 1;

                if (requireAll) {
                    return null;
                }
            }
        }

        if (matched === 0) {
            return null;
        }

        return total + missed * 3;
    }

    function closestMatches(words) {
        var scored = [];
        var pass;

        /* Pass 1: all words must be close. Pass 2: at least one word. */
        for (pass = 0; pass < 2 && scored.length === 0; pass += 1) {
            products.forEach(function (p) {
                var score = fuzzyScore(p, words, pass === 0);

                if (score !== null) {
                    scored.push({ product: p, score: score });
                }
            });
        }

        scored.sort(function (a, b) {
            return a.score - b.score ||
                a.product.title.localeCompare(b.product.title);
        });

        return scored.map(function (item) {
            return item.product;
        });
    }

    /* Decides which products to show.
       Returns { items: [...], fuzzy: true/false }. */
    function getVisible() {
        var words = searchWords();

        /* No search text: use the category buttons as before. */
        if (words.length === 0) {
            return {
                items: products.filter(function (p) {
                    return activeCategory === 'all' || p.category === activeCategory;
                }),
                fuzzy: false
            };
        }

        /* Search text: look through ALL categories, exact matches first. */
        var exact = products.filter(function (p) {
            return matchesExact(p, words);
        });

        if (exact.length > 0) {
            return { items: exact, fuzzy: false };
        }

        /* Nothing matched exactly: try the closest matches (typos). */
        return { items: closestMatches(words), fuzzy: true };
    }

    /* Highlights the "All items" button while searching, and puts the
       real selected category back when the search box is empty. */
    function updateFilterButtons() {
        var showing = searchTerm ? 'all' : activeCategory;

        filterButtons.forEach(function (button) {
            button.classList.toggle(
                'active',
                (button.getAttribute('data-category') || 'all') === showing
            );
        });
    }

    function render() {
        grid.textContent = '';

        if (state === 'loading') {
            grid.appendChild(message('Loading items…'));
            return;
        }

        if (state === 'error') {
            grid.appendChild(message(errorText));
            return;
        }

        if (products.length === 0) {
            grid.appendChild(
                message('No items have been listed yet. Check back soon.')
            );
            return;
        }

        var result = getVisible();
        var visible = result.items;

        if (visible.length === 0) {
            grid.appendChild(
                message(
                    searchTerm
                        ? 'No items match "' + searchTerm + '". Try another word, category or shop name.'
                        : 'No items in this category yet.'
                )
            );
            return;
        }

        if (result.fuzzy) {
            grid.appendChild(
                fuzzyNotice(
                    'No exact match for "' + searchTerm + '". Showing the closest results.'
                )
            );
        }

        visible.forEach(function (p) {
            grid.appendChild(buildCard(p));
        });
    }

    /* ---------- LOAD PRODUCTS ---------- */

    function load(silent) {
        if (inFlight) {
            return Promise.resolve();
        }

        inFlight = true;

        if (!silent) {
            state = 'loading';
            render();
        }

        return fetch(API_URL, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
                'Accept': 'application/json'
            }
        })
            .then(function (res) {
                return res.text().then(function (text) {
                    var data;

                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        throw new Error(
                            'get_products.php did not return JSON. It returned: ' +
                            text.slice(0, 120)
                        );
                    }

                    if (!res.ok || !data.ok) {
                        throw new Error(
                            (data && (data.detail || data.error)) ||
                            ('HTTP ' + res.status)
                        );
                    }

                    return data;
                });
            })
            .then(function (data) {
                products = (data.products || []).map(normalize);
                state = 'ready';
            })
            .catch(function (err) {
                console.error(TAG, err.message || err);

                if (silent && state === 'ready') {
                    return;
                }

                state = 'error';

                errorText =
                    'We could not load the items right now. Please refresh the page.' +
                    (location.protocol === 'file:'
                        ? ' (Open this page through http://localhost/, not as a file.)'
                        : '');
            })
            .then(function () {
                inFlight = false;
                render();
            });
    }

    /* ---------- PRODUCT DETAILS DIALOG ---------- */

    var productDialog = document.getElementById('product-dialog');
    var pdImage = document.getElementById('product-dialog-img');
    var pdCondition = document.getElementById('product-dialog-condition');
    var pdCategory = document.getElementById('product-dialog-category');
    var pdTitle = document.getElementById('product-dialog-title');
    var pdPrice = document.getElementById('product-dialog-price');
    var pdSeller = document.getElementById('product-dialog-seller');
    var pdDescription = document.getElementById('product-dialog-description');
    var pdClose = document.getElementById('product-dialog-close');
    var pdBack = document.getElementById('product-dialog-back');
    var pdAddCart = document.getElementById('product-dialog-add-cart');
    var pdBuy = document.getElementById('product-dialog-buy');
    var pdNotice = document.getElementById('product-dialog-notice');
    var pdFavorite = document.getElementById('product-dialog-favorite');


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

    var EMPTY_DESCRIPTION =
        'The seller has not added a description for this item yet.';

    function findProduct(id) {
        for (var i = 0; i < products.length; i += 1) {
            if (products[i].id === String(id)) {
                return products[i];
            }
        }

        return null;
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

        /* Show the saved favorite state on the dialog star. */
        setFavoriteState(pdFavorite, isFavorite(p.id));

        if (!productDialog.open) {
            productDialog.showModal();
        }

        productDialog.scrollTop = 0;
    }

    /* ---------- FAVORITE STAR ON THE PRODUCT CARDS ---------- */

    grid.addEventListener('click', function (event) {
        var star = event.target.closest('.product-favorite');

        if (!star) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (favBusy) {
            return;
        }

        var product = findProduct(star.getAttribute('data-id'));

        if (!product) {
            return;
        }

        favBusy = true;

        toggleFavorite(product).then(function (result) {
            favBusy = false;

            if (result === null) {
                showToast(lastError || 'Could not update your favorites.', false);
                return;
            }

            syncFavoriteButtons();
            showFavoriteToast(result);
        });
    });

    if (productDialog && pdImage) {
        /* The + button opens the product details dialog. */
        grid.addEventListener('click', function (event) {
            var button = event.target.closest('.product-add');

            if (!button) {
                return;
            }

            event.preventDefault();

            var product = findProduct(button.getAttribute('data-id'));

            if (product) {
                openProduct(product);
            }
        });

        /* Clicking the product image on a card also opens its details. */
        grid.addEventListener('click', function (event) {
            var link = event.target.closest('.product-image-link');

            if (!link) {
                return;
            }

            event.preventDefault();

            var card = link.closest('.product');
            var button = card ? card.querySelector('.product-add') : null;
            var product = button
                ? findProduct(button.getAttribute('data-id'))
                : null;

            if (product) {
                openProduct(product);
            }
        });

        pdImage.addEventListener('error', function () {
            if (!pdImage.getAttribute('data-fallback')) {
                pdImage.setAttribute('data-fallback', '1');
                pdImage.src = PLACEHOLDER;
            }
        });

        if (pdClose) {
            pdClose.addEventListener('click', function () {
                productDialog.close();
            });
        }

        if (pdBack) {
            pdBack.addEventListener('click', function (event) {
                event.preventDefault();
                productDialog.close();

                var section = document.getElementById('products');

                if (section) {
                    section.scrollIntoView();
                }
            });
        }

        /* FAVORITE: add / remove the open product, then refresh the card stars. */
        if (pdFavorite) {
            pdFavorite.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                if (!currentProduct || favBusy) {
                    return;
                }

                favBusy = true;

                toggleFavorite(currentProduct).then(function (result) {
                    favBusy = false;

                    if (result === null) {
                        showNotice(
                            lastError || 'Could not save to your favorites. Please try again.',
                            'error'
                        );
                        return;
                    }

                    syncFavoriteButtons();
                    showFavoriteToast(result);
                });
            });
        }

        /* ADD TO CART: save the product and stay in the product dialog. */
        if (pdAddCart) {
            pdAddCart.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                if (!currentProduct || cartBusy) {
                    return;
                }

                cartBusy = true;

                addToCart(currentProduct).then(function (result) {
                    cartBusy = false;

                    if (result === 'added') {
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

        /*
         * BUY ITEM: open checkout only.
         * IMPORTANT: do not call addToCart() here.
         * IMPORTANT: do not redirect to profile.html#cart.
         */
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
    }

    /* ---------- CHECKOUT DIALOG ---------- */

    var checkoutDialog = document.getElementById('checkout-dialog');
    var checkoutBack = document.getElementById('checkout-back');
    var checkoutClose = document.getElementById('checkout-close');
    var checkoutSubmit = document.getElementById('checkout-submit');

    /* The quantity selector was removed, so an order is always 1 item. */
    var checkoutQty = 1;

    /* Change these fees if your project uses different amounts. */
    var SHIPPING_FEE = 80;
    var SERVICE_FEE = 20;

    function peso(amount) {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
            minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

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
            showNotice(
                'Checkout dialog was not found. Check that your HTML contains #checkout-dialog.',
                'error'
            );
            console.error(TAG, 'Missing #checkout-dialog in the HTML.');
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
            showNotice(
                'Some checkout elements are missing. Check the checkout HTML IDs.',
                'error'
            );
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
        var checkoutImageForFallback =
            checkoutElement('checkout-image');

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

    /* ---------- CATEGORY FILTERS ----------
       Clicking a category also clears the search box,
       so the category you click is the one that shows. */

    filterButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            activeCategory = btn.getAttribute('data-category') || 'all';

            searchTerm = '';

            if (searchInput) {
                searchInput.value = '';
            }

            updateFilterButtons();
            render();
        });
    });

    /* ---------- SEARCH BAR ----------
       Searches every category, matches product names AND seller / shop
       names (and more), forgives typos, and scrolls down to the products
       so the results are visible. */

    function scrollToProducts() {
        var section = document.getElementById('products');

        if (!section) {
            return;
        }

        /* Only scroll if the products section is not already near the top. */
        var top = section.getBoundingClientRect().top;

        if (top > 120 || top < -section.offsetHeight + 200) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function applySearch(shouldScroll) {
        searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

        updateFilterButtons();
        render();

        if (shouldScroll && searchTerm) {
            scrollToProducts();
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            applySearch(true);
        });

        /* Pressing Enter also jumps to the results. */
        searchInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                applySearch(true);
            }
        });

        /* Handles the little "x" some browsers show inside search boxes. */
        searchInput.addEventListener('search', function () {
            applySearch(false);
        });
    }

    /* ---------- KEEP PRODUCTS AND FAVORITES UP TO DATE ---------- */

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            load(true);
            refreshFavorites();
        }
    });

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            load(true);
            refreshFavorites();
        }
    });

    window.addEventListener('storage', function (event) {
        if (event.key === CHANGE_KEY) {
            load(true);
        }

        /* Favorites changed in another tab (logged-out visitors only). */
        if (event.key === FAV_KEY) {
            syncFavoriteButtons();
        }
    });

    setInterval(function () {
        if (!document.hidden) {
            load(true);
        }
    }, POLL_MS);

    /* ---------- SELL AN ITEM / SELLER STUDIO LOGIN CHECK ---------- */

    var SELL_LOGGED_IN = 'Seller-Studio.html';

    var sellLink = document.getElementById('sell-link');
    var sellDialog = document.getElementById('sell-dialog');
    var sellDialogClose = document.getElementById('sell-dialog-close');
    var sellChecking = false;

    function openSellDialog() {
        if (sellDialog &&
            typeof sellDialog.showModal === 'function') {
            if (!sellDialog.open) {
                sellDialog.showModal();
            }
        } else {
            window.location.href = 'create-account.html';
        }
    }

    if (sellLink) {
        sellLink.addEventListener('click', function (event) {
            event.preventDefault();

            if (sellChecking) {
                return;
            }

            sellChecking = true;

            isLoggedIn().then(function (loggedIn) {
                sellChecking = false;

                if (loggedIn) {
                    window.location.href = SELL_LOGGED_IN;
                } else {
                    openSellDialog();
                }
            });
        });
    }

    if (sellDialogClose && sellDialog) {
        sellDialogClose.addEventListener('click', function () {
            sellDialog.close();
        });
    }

    if (sellDialog) {
        sellDialog.addEventListener('click', function (event) {
            if (event.target === sellDialog) {
                sellDialog.close();
            }
        });
    }

    /* ---------- WHO IS LOGGED IN? ----------
       Runs once at page load. Favorites and cart actions wait for it. */

    var sessionReady = isLoggedIn()
        .then(function (loggedIn) {
            auth.loggedIn = loggedIn;

            if (!loggedIn) {
                return null;
            }

            return mergeLocalData()
                .then(loadServerFavorites)
                .catch(function (err) {
                    console.error(TAG, 'Could not load your favorites:', err.message || err);
                });
        })
        .then(function () {
            syncFavoriteButtons();
        })
        .catch(function (err) {
            console.error(TAG, err.message || err);
        });

    /* Initial product load */
    load(false);
})();
(function () {
    'use strict';

    /* SETTINGS */
    const CURRENCY = 'PHP';
    const API_URL = 'listings_api.php';

    /* wallet endpoints (one shared balance for Credit, Profile and Payouts) */
    const WALLET_URL = 'get-wallet.php';
    const TRANSFER_URL = 'wallet-transfer.php';

    /* NEW: real orders for this seller (items bought from them) */
    const ORDERS_URL = 'seller-orders.php';

    const ALLOWED_CONDITIONS = ['Like new', 'Good', 'Fair'];
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

    /* most photos per item (the first one is the cover). The same limit
       is checked again in listings_api.php (FYND_MAX_PHOTOS). */
    const MAX_IMAGES = 5;

    /* 560 -> 900 so the photos still look sharp when a buyer opens
       them full screen. If saving ever says a request is too large, set this
       back to 560. */
    const MAX_IMAGE_EDGE = 900;
    const IMAGE_QUALITY = 0.8;

    /* ORDERS
       CHANGED: the sample orders were removed. Orders are loaded from the
       database (seller-orders.php). */
    let ORDERS = [];
    let ordersLoaded = false;
    let ordersLoading = false;
    let ordersError = '';

    /* PAYOUTS
       Nothing is hardcoded. The balance and the activity list are loaded
       from the database (get-wallet.php?history=1). */
    let availableBalance = 0;
    let PAYOUTS = [];
    let walletLoading = false;

    const METHOD_ICONS = {
        wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V7a2 2 0 0 1 2-2h11v4"></path><rect x="3" y="7" width="18" height="13" rx="3"></rect><path d="M16 13.5h5v3.5h-5a1.75 1.75 0 0 1 0-3.5z"></path></svg>',
        bank: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10 12 4l9 6"></path><path d="M5 10v8M10 10v8M14 10v8M19 10v8"></path><path d="M3 20h18"></path></svg>'
    };

    const BANKS = [
        { name: 'BPI', type: 'bank' },
        { name: 'BDO', type: 'bank' },
        { name: 'UnionBank', type: 'bank' },
        { name: 'Metrobank', type: 'bank' },
        { name: 'GCash', type: 'wallet' },
        { name: 'Maya', type: 'wallet' }
    ];

    /* HELPERS */
    const $ = (selector, root) =>
        (root || document).querySelector(selector);

    const $$ = (selector, root) =>
        Array.prototype.slice.call(
            (root || document).querySelectorAll(selector)
        );

    function el(tag, className, text) {
        const node = document.createElement(tag);

        if (className) node.className = className;

        if (text !== undefined && text !== null) {
            node.textContent = text;
        }

        return node;
    }

    const money0 = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: CURRENCY,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });

    const money2 = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function formatMoney(value) {
        return Number.isInteger(value)
            ? money0.format(value)
            : money2.format(value);
    }

    function hueFor(text) {
        let sum = 0;

        for (let i = 0; i < text.length; i += 1) {
            sum += text.charCodeAt(i);
        }

        return sum % 360;
    }

    function buildThumb(title, image) {
        const thumb = el('div', 'thumb');
        thumb.style.setProperty('--hue', String(hueFor(title)));

        thumb.appendChild(
            el(
                'span',
                'thumb-letter',
                (title.trim().charAt(0) || '?').toUpperCase()
            )
        );

        if (image) {
            const img = document.createElement('img');
            img.alt = '';

            if (image.indexOf('data:') !== 0) {
                img.loading = 'lazy';
            }

            img.src = image;

            img.addEventListener('error', function () {
                img.remove();
            });

            thumb.appendChild(img);
        }

        return thumb;
    }

    function capitalize(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }

    /* GREETING */
    function setupGreeting() {
        const hour = new Date().getHours();

        const text = hour < 12
            ? 'Good morning'
            : (hour < 18 ? 'Good afternoon' : 'Good evening');

        $('#greeting-text').textContent = text;

        const accountName = $('.sidebar-account-details strong');
        const firstName = accountName
            ? accountName.textContent.trim().split(/\s+/)[0]
            : '';

        $('#greeting-name').textContent = firstName || 'there';
    }

    /* LISTINGS API */
    const EMPTY_TEXT = $('#listing-empty').textContent;
    const ORDER_EMPTY_TEXT = $('#order-empty').textContent;

    let listings = [];
    let listingsLoaded = false;

    /* every listing has "images" (all photos, cover first) */
    function normalizeListing(raw) {
        let images = Array.isArray(raw.images)
            ? raw.images.map(String).filter(Boolean)
            : [];

        const cover = raw.image ? String(raw.image) : '';

        if (images.length === 0 && cover) {
            images = [cover];
        }

        return {
            id: String(raw.id),
            title: String(raw.title || ''),
            category: String(raw.category || 'Other'),
            size: raw.size ? String(raw.size) : '',
            description: String(raw.description || ''),
            price: Number(raw.price) || 0,
            condition: ALLOWED_CONDITIONS.indexOf(raw.condition) !== -1
                ? raw.condition
                : 'Good',
            views: Number(raw.views) || 0,
            image: images[0] || cover,
            images: images,
            status: 'live'
        };
    }

    function errorMessage(error) {
        let text = (error && error.message) ||
            'Something went wrong. Please try again.';

        if (error && error.detail) {
            text += ' (' + error.detail + ')';
        }

        return text;
    }

    function apiRequest(url, options) {
        const settings = Object.assign(
            { credentials: 'same-origin', cache: 'no-store' },
            options
        );

        return fetch(url, settings)
            .catch(function () {
                throw new Error(
                    'Could not reach the server. Check that Apache is running and try again.'
                );
            })
            .then(function (response) {
                return response.text().then(function (text) {
                    let data = null;

                    try {
                        data = JSON.parse(text);
                    } catch (error) {
                        data = null;
                    }

                    if (!data) {
                        throw new Error(
                            'The server sent an unexpected response (HTTP ' +
                            response.status + ').'
                        );
                    }

                    if (!response.ok || !data.ok) {
                        const failure = new Error(
                            data.error ||
                            'Request failed (HTTP ' + response.status + ').'
                        );

                        failure.status = response.status;
                        failure.detail = data.detail || '';

                        throw failure;
                    }

                    return data;
                });
            });
    }

    /* accepts an optional URL (defaults to the listings API) */
    function postJson(payload, url) {
        return apiRequest(url || API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    }

    function showListingsMessage(text) {
        const empty = $('#listing-empty');

        $('#listing-list').hidden = true;
        empty.textContent = text;
        empty.hidden = false;
    }

    function loadListings() {
        return apiRequest(API_URL + '?action=list', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (data) {
                listings = (data.listings || []).map(normalizeListing);
                listingsLoaded = true;
                renderListings();
            })
            .catch(function (error) {
                console.error('Unable to load listings.', error);

                showListingsMessage(
                    'We could not load your listings. ' +
                    errorMessage(error)
                );
            });
    }

    function viewsText(item) {
        if (item.status !== 'live') return '— views';

        const views = item.views || 0;

        return views + (views === 1 ? ' view' : ' views');
    }

    /* RENDER LISTING ROWS */
    function buildListingRow(item) {
        const row = el('li', 'item-row');

        row.appendChild(buildThumb(item.title, item.image));

        const info = el('div', 'item-info');
        const nameLine = el('div', 'item-name-line');

        nameLine.appendChild(
            el('strong', 'item-name', item.title)
        );

        const condition = ALLOWED_CONDITIONS.indexOf(item.condition) !== -1
            ? item.condition
            : 'Good';

        nameLine.appendChild(
            el('span', 'badge badge-condition', condition)
        );

        info.appendChild(nameLine);

        if (item.description) {
            info.appendChild(
                el('p', 'item-description', item.description)
            );
        }

        const metaParts = [item.category];

        if (item.size) metaParts.push(item.size);

        /* shows "3 photos" when an item has more than one */
        if (item.images && item.images.length > 1) {
            metaParts.push(item.images.length + ' photos');
        }

        metaParts.push(viewsText(item));

        info.appendChild(
            el('p', 'item-meta', metaParts.join(' · '))
        );

        row.appendChild(info);

        const actions = el('div', 'item-actions');

        actions.appendChild(
            el('span', 'item-price', formatMoney(item.price))
        );

        const editButton = el('button', 'ghost-button', 'Edit');
        editButton.type = 'button';
        editButton.setAttribute('data-edit-id', item.id);
        editButton.setAttribute('aria-label', 'Edit ' + item.title);

        actions.appendChild(editButton);
        row.appendChild(actions);

        return row;
    }

    function renderListings() {
        const list = $('#listing-list');
        const empty = $('#listing-empty');

        list.textContent = '';

        if (!listingsLoaded) {
            list.hidden = true;
            empty.hidden = true;
            return;
        }

        empty.textContent = EMPTY_TEXT;

        listings.forEach(function (item) {
            list.appendChild(buildListingRow(item));
        });

        list.hidden = listings.length === 0;
        empty.hidden = listings.length > 0;
    }

    /* ORDERS (NEW: loaded from seller-orders.php) */

    /* database status -> the badge class the CSS already has */
    function orderBadgeClass(status) {
        const key = String(status || '').toLowerCase();

        if (key === 'shipped' || key === 'in_transit') return 'shipped';
        if (key === 'delivered') return 'delivered';
        if (key === 'cancelled') return 'cancelled';

        /* paid / processing / anything new = waiting to be sent */
        return 'pending';
    }

    function orderStatusLabel(status) {
        const key = String(status || '').toLowerCase();

        if (key === 'in_transit') return 'In transit';
        if (key === 'paid') return 'Paid';

        return key ? capitalize(key) : 'Paid';
    }

    function orderDateText(value) {
        if (!value) return '';

        const when = new Date(String(value).replace(' ', 'T'));

        if (isNaN(when.getTime())) return '';

        return when.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        });
    }

    function normalizeOrder(raw) {
        const items = Array.isArray(raw.items) ? raw.items : [];
        const first = items[0];

        let title = first ? String(first.name || 'Item') : 'Order';

        if (items.length > 1) {
            title += ' +' + (items.length - 1) + ' more';
        }

        return {
            id: String(raw.id),
            item: title,
            image: first ? String(first.image || '') : '',
            buyer: String(raw.buyer || 'Buyer'),
            date: orderDateText(raw.created_at),
            amount: Number(raw.total) || 0,
            status: String(raw.status || 'paid')
        };
    }

    function loadOrders() {
        if (ordersLoading) return Promise.resolve();

        ordersLoading = true;

        return apiRequest(ORDERS_URL, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (data) {
                ORDERS = (data.orders || []).map(normalizeOrder);
                ordersLoaded = true;
                ordersError = '';
                renderOrders();
            })
            .catch(function (error) {
                console.error('Unable to load orders.', error);

                ordersError =
                    'We could not load your orders. ' + errorMessage(error);

                renderOrders();
            })
            .then(function () {
                ordersLoading = false;
            });
    }

    function renderOrders() {
        const list = $('#order-list');
        const empty = $('#order-empty');

        list.textContent = '';

        if (ordersError) {
            list.hidden = true;
            empty.textContent = ordersError;
            empty.hidden = false;
            return;
        }

        if (!ordersLoaded) {
            list.hidden = true;
            empty.textContent = 'Loading your orders…';
            empty.hidden = false;
            return;
        }

        empty.textContent = ORDER_EMPTY_TEXT;

        ORDERS.forEach(function (order) {
            const row = el('li', 'item-row');
            row.appendChild(buildThumb(order.item, order.image));

            const info = el('div', 'item-info');
            const nameLine = el('div', 'item-name-line');

            nameLine.appendChild(
                el('strong', 'item-name', order.item)
            );

            nameLine.appendChild(
                el(
                    'span',
                    'badge badge-' + orderBadgeClass(order.status),
                    orderStatusLabel(order.status)
                )
            );

            info.appendChild(nameLine);

            info.appendChild(
                el(
                    'p',
                    'item-meta',
                    '#FY-' + String(order.id).padStart(4, '0') + ' · ' +
                    order.buyer +
                    (order.date ? ' · ' + order.date : '')
                )
            );

            row.appendChild(info);

            const actions = el('div', 'item-actions is-price-only');

            actions.appendChild(
                el('span', 'item-price', formatMoney(order.amount))
            );

            row.appendChild(actions);
            list.appendChild(row);
        });

        list.hidden = ORDERS.length === 0;
        empty.hidden = ORDERS.length > 0;
    }

    /* PAYOUTS */
    function payoutCell(label, className) {
        const cell = el('td', className);
        cell.setAttribute('data-label', label);
        return cell;
    }

    /* turns one database transaction row into a table row */
    function normalizeTxn(raw) {
        const when = raw.created_at
            ? new Date(String(raw.created_at).replace(' ', 'T'))
            : new Date();
        const valid = !isNaN(when.getTime());
        const method = String(raw.method || '');

        const bank = BANKS.filter(function (item) {
            return item.name === method;
        })[0];

        return {
            id: 't' + raw.id,
            date: valid
                ? when.toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric'
                })
                : '',
            time: valid
                ? when.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : '',
            description: String(raw.description || ''),
            detail: String(raw.detail || ''),
            method: method || 'FYND',
            methodType: bank ? bank.type : 'wallet',
            status: String(raw.status || 'completed'),
            direction: raw.direction === 'out' ? 'out' : 'in',
            amount: Number(raw.amount) || 0
        };
    }

    /* loads the SAME balance the Credit tab and Profile card use */
    function loadWallet() {
        if (walletLoading) return Promise.resolve();

        walletLoading = true;

        return apiRequest(WALLET_URL + '?history=1', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (data) {
                availableBalance = Number(data.balance) || 0;
                PAYOUTS = (data.transactions || []).map(normalizeTxn);
                renderPayouts();
            })
            .catch(function (error) {
                console.error('Unable to load the wallet.', error);

                const note = $('#transfer-note');
                note.textContent =
                    'We could not load your balance. ' + errorMessage(error);
                note.hidden = false;
            })
            .then(function () {
                walletLoading = false;
            });
    }

    function renderPayouts() {
        $('#payout-balance').textContent = money2.format(availableBalance);

        const transferButton = $('#transfer-funds-btn');
        transferButton.disabled = availableBalance <= 0;

        const body = $('#payout-list');
        body.textContent = '';

        PAYOUTS.forEach(function (payout) {
            const row = el('tr');

            const dateCell = payoutCell('Date');
            dateCell.appendChild(el('span', 'cell-main', payout.date));
            dateCell.appendChild(el('span', 'cell-sub', payout.time));
            row.appendChild(dateCell);

            const descriptionCell = payoutCell('Description');

            descriptionCell.appendChild(
                el('span', 'cell-main', payout.description)
            );

            descriptionCell.appendChild(
                el('span', 'cell-sub', payout.detail)
            );

            row.appendChild(descriptionCell);

            const methodCell = payoutCell('Method');
            const method = el('span', 'payout-method');
            const icon = el('span', 'method-icon');

            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = METHOD_ICONS[payout.methodType] || METHOD_ICONS.bank;

            method.appendChild(icon);
            method.appendChild(el('span', '', payout.method));
            methodCell.appendChild(method);
            row.appendChild(methodCell);

            const statusCell = payoutCell('Status');

            statusCell.appendChild(
                el(
                    'span',
                    'payout-status status-' + payout.status,
                    capitalize(payout.status)
                )
            );

            row.appendChild(statusCell);

            /* + for money in, − for money out */
            const amountCell = payoutCell('Amount', 'col-amount');
            amountCell.textContent =
                (payout.direction === 'out' ? '−' : '+') +
                money2.format(payout.amount);
            row.appendChild(amountCell);

            body.appendChild(row);
        });

        $('#payout-table-wrap').hidden = PAYOUTS.length === 0;
        $('#payout-empty').hidden = PAYOUTS.length > 0;
    }

    /* TRANSFER FUNDS DIALOG */
    function setupTransfer() {
        const dialog = $('#transfer-dialog');
        const form = $('#transfer-form');
        const openButton = $('#transfer-funds-btn');
        const note = $('#transfer-note');
        const options = $('#bank-options');
        const balanceText = $('#transfer-balance');
        const bankError = $('#transfer-bank-error');
        const formError = $('#transfer-form-error');
        const submitButton = $('#transfer-submit');

        const nameInput = $('#transfer-name');
        const numberInput = $('#transfer-number');

        const amountInput = $('#transfer-amount');
        const amountMax = $('#transfer-amount-max');
        const amountAvailable = $('#transfer-amount-available');

        /* stops double-clicks while the server is working */
        let transferring = false;

        BANKS.forEach(function (bank, index) {
            const label = el('label', 'bank-option');
            const input = document.createElement('input');

            input.type = 'radio';
            input.name = 'bank';
            input.value = bank.name;
            input.className = 'bank-input';

            if (index === 0) {
                input.defaultChecked = true;
                input.checked = true;
            }

            const card = el('span', 'bank-card');
            const icon = el('span', 'method-icon');
            const radio = el('span', 'bank-radio');

            icon.setAttribute('aria-hidden', 'true');
            radio.setAttribute('aria-hidden', 'true');
            icon.innerHTML = METHOD_ICONS[bank.type];

            card.appendChild(icon);
            card.appendChild(el('span', 'bank-name', bank.name));
            card.appendChild(radio);

            label.appendChild(input);
            label.appendChild(card);
            options.appendChild(label);
        });

        function selectedBank() {
            const checked = $('.bank-input:checked', options);

            if (!checked) return null;

            return BANKS.filter(function (bank) {
                return bank.name === checked.value;
            })[0] || null;
        }

        function accountRule(bank) {
            if (bank && bank.type === 'wallet') {
                return {
                    pattern: /^09\d{9}$/,
                    placeholder: '09XXXXXXXXX',
                    message: 'Enter an 11-digit mobile number starting with 09.'
                };
            }

            return {
                pattern: /^\d{10,16}$/,
                placeholder: 'Enter account number',
                message: 'Enter a valid account number (10 to 16 digits).'
            };
        }

        function updatePlaceholder() {
            numberInput.placeholder = accountRule(selectedBank()).placeholder;
        }

        function setFieldError(input, message) {
            const errorElement = document.getElementById(input.id + '-error');

            errorElement.textContent = message;
            input.classList.toggle('is-invalid', message !== '');
            input.setAttribute(
                'aria-invalid',
                message !== '' ? 'true' : 'false'
            );

            return message === '';
        }

        function validateBank() {
            const ok = selectedBank() !== null;
            bankError.textContent = ok ? '' : 'Please choose a bank or e-wallet.';
            return ok;
        }

        function validateName() {
            const value = nameInput.value.trim();

            if (value === '') {
                return setFieldError(nameInput, 'Please enter the account name.');
            }

            if (value.length < 2) {
                return setFieldError(nameInput, 'Account name is too short.');
            }

            return setFieldError(nameInput, '');
        }

        function validateNumber() {
            const value = numberInput.value.trim();

            if (value === '') {
                return setFieldError(numberInput, 'Please enter the account number.');
            }

            const rule = accountRule(selectedBank());

            return setFieldError(
                numberInput,
                rule.pattern.test(value) ? '' : rule.message
            );
        }

        /* the amount is compared in centavos so decimals never drift */
        function toCents(value) {
            return Math.round(value * 100);
        }

        function validateAmount() {
            const raw = amountInput.value.trim();

            if (raw === '') {
                return setFieldError(amountInput, 'Please enter an amount.');
            }

            const value = Number(raw);

            if (!Number.isFinite(value) || value <= 0) {
                return setFieldError(
                    amountInput,
                    'Enter an amount greater than ' + money2.format(0) + '.'
                );
            }

            if (toCents(value) > toCents(availableBalance)) {
                return setFieldError(
                    amountInput,
                    'The amount cannot be more than your available balance of ' +
                    money2.format(availableBalance) + '.'
                );
            }

            return setFieldError(amountInput, '');
        }

        function clearTransferErrors() {
            bankError.textContent = '';
            formError.textContent = '';
            setFieldError(nameInput, '');
            setFieldError(numberInput, '');
            setFieldError(amountInput, '');
        }

        /* allow only digits and one decimal point (max 2 decimals) */
        amountInput.addEventListener('input', function () {
            let value = amountInput.value.replace(/[^\d.]/g, '');
            const firstDot = value.indexOf('.');

            if (firstDot !== -1) {
                value = value.slice(0, firstDot + 1) +
                    value.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
            }

            amountInput.value = value;

            if (amountInput.classList.contains('is-invalid')) {
                validateAmount();
            }
        });

        amountInput.addEventListener('blur', function () {
            if (amountInput.value.trim() !== '') {
                validateAmount();
            }
        });

        amountMax.addEventListener('click', function () {
            amountInput.value = availableBalance.toFixed(2);
            validateAmount();
            amountInput.focus();
        });

        numberInput.addEventListener('input', function () {
            numberInput.value = numberInput.value.replace(/\D/g, '');

            if (numberInput.classList.contains('is-invalid')) {
                validateNumber();
            }
        });

        nameInput.addEventListener('input', function () {
            if (nameInput.classList.contains('is-invalid')) {
                validateName();
            }
        });

        nameInput.addEventListener('blur', validateName);
        numberInput.addEventListener('blur', validateNumber);

        options.addEventListener('change', function () {
            bankError.textContent = '';
            updatePlaceholder();

            if (numberInput.value !== '') {
                validateNumber();
            }
        });

        openButton.addEventListener('click', function () {
            if (availableBalance <= 0) return;

            form.reset();
            clearTransferErrors();
            updatePlaceholder();

            balanceText.textContent = money2.format(availableBalance);
            amountAvailable.textContent =
                'Available: ' + money2.format(availableBalance);
            note.hidden = true;

            dialog.showModal();
            nameInput.focus();
        });

        $$('[data-dialog-close]', dialog).forEach(function (button) {
            button.addEventListener('click', function () {
                dialog.close();
            });
        });

        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                dialog.close();
            }
        });

        form.addEventListener('submit', function (event) {
            event.preventDefault();

            if (transferring) return;

            const bankOk = validateBank();
            const nameOk = validateName();
            const numberOk = validateNumber();
            const amountOk = validateAmount();

            if (!bankOk || !nameOk || !numberOk || !amountOk) {
                if (!nameOk) {
                    nameInput.focus();
                } else if (!numberOk) {
                    numberInput.focus();
                } else if (!amountOk) {
                    amountInput.focus();
                }

                return;
            }

            if (availableBalance <= 0) {
                formError.textContent = 'There is no balance to transfer.';
                return;
            }

            const bank = selectedBank();
            const amount = Math.round(Number(amountInput.value.trim()) * 100) / 100;
            const masked = '••••' + numberInput.value.trim().slice(-4);

            /* the server deducts the amount from the shared wallet.
               The balance shown here is whatever the server sends back. */
            transferring = true;
            submitButton.disabled = true;
            submitButton.textContent = 'Transferring…';
            formError.textContent = '';

            postJson({
                bank: bank.name,
                accountName: nameInput.value.trim(),
                accountNumber: numberInput.value.trim(),
                amount: amount
            }, TRANSFER_URL)
                .then(function (data) {
                    availableBalance = Number(data.balance) || 0;
                    renderPayouts();

                    note.textContent =
                        'Transfer of ' + money2.format(amount) + ' to ' + bank.name +
                        ' (' + masked + ') requested. Remaining balance: ' +
                        money2.format(availableBalance) +
                        '. It now shows as Pending below.';
                    note.hidden = false;

                    dialog.close();
                    loadWallet();
                })
                .catch(function (error) {
                    formError.textContent = errorMessage(error);
                })
                .then(function () {
                    transferring = false;
                    submitButton.disabled = false;
                    submitButton.textContent = 'Continue';
                });
        });
    }

    /* TABS */
    const tabs = $$('.tab');

    function activateTab(tab, moveFocus, updateHash) {
        tabs.forEach(function (item) {
            const selected = item === tab;

            item.setAttribute('aria-selected', String(selected));
            item.tabIndex = selected ? 0 : -1;

            document.getElementById(
                item.getAttribute('aria-controls')
            ).hidden = !selected;
        });

        /* always show the latest balance when Payouts is opened */
        if (tab.dataset.tab === 'payouts') {
            loadWallet();
        }

        /* NEW: always show the latest orders when Orders is opened */
        if (tab.dataset.tab === 'orders') {
            loadOrders();
        }

        if (moveFocus) {
            tab.focus({ preventScroll: true });
        }

        if (updateHash) {
            try {
                window.history.replaceState(null, '', '#' + tab.dataset.tab);
            } catch (error) {
                // Ignore unsupported history updates.
            }
        }
    }

    function setupTabs() {
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                activateTab(tab, false, true);
            });
        });

        $('.tabs').addEventListener('keydown', function (event) {
            const current = tabs.indexOf(document.activeElement);

            if (current === -1) return;

            let next = -1;

            if (event.key === 'ArrowRight') {
                next = (current + 1) % tabs.length;
            } else if (event.key === 'ArrowLeft') {
                next = (current - 1 + tabs.length) % tabs.length;
            } else if (event.key === 'Home') {
                next = 0;
            } else if (event.key === 'End') {
                next = tabs.length - 1;
            }

            if (next !== -1) {
                event.preventDefault();
                activateTab(tabs[next], true, true);
            }
        });

        const fromHash = window.location.hash.replace('#', '');

        const initial = tabs.filter(function (tab) {
            return tab.dataset.tab === fromHash;
        })[0] || tabs[0];

        activateTab(initial, false, false);
    }

    /* SIDEBAR */
    function setupSidebar() {
        const sidebar = $('#sidebar');
        const backdrop = $('#sidebar-backdrop');
        const menuButton = $('#menu-toggle');
        const closeButton = $('#sidebar-close');
        const smallScreen = window.matchMedia('(max-width: 900px)');

        function openSidebar() {
            sidebar.classList.add('is-open');
            backdrop.hidden = false;
            menuButton.setAttribute('aria-expanded', 'true');
            document.body.classList.add('no-scroll');
            closeButton.focus();
        }

        function closeSidebar(returnFocus) {
            sidebar.classList.remove('is-open');
            backdrop.hidden = true;
            menuButton.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('no-scroll');

            if (returnFocus) menuButton.focus();
        }

        menuButton.addEventListener('click', openSidebar);

        closeButton.addEventListener('click', function () {
            closeSidebar(true);
        });

        backdrop.addEventListener('click', function () {
            closeSidebar(true);
        });

        $$('.nav-link, .sidebar-account', sidebar).forEach(function (link) {
            link.addEventListener('click', function () {
                closeSidebar(false);
            });
        });

        document.addEventListener('keydown', function (event) {
            if (
                event.key === 'Escape' &&
                sidebar.classList.contains('is-open')
            ) {
                closeSidebar(true);
            }
        });

        function onBreakpointChange() {
            if (!smallScreen.matches) closeSidebar(false);
        }

        if (smallScreen.addEventListener) {
            smallScreen.addEventListener('change', onBreakpointChange);
        } else {
            smallScreen.addListener(onBreakpointChange);
        }
    }

    /* NEW / EDIT LISTING DIALOG */
    function setupListingDialog() {
        const dialog = $('#listing-dialog');
        const form = $('#listing-form');
        const titleEl = $('#listing-dialog-title');
        const saveButton = $('#listing-save');
        const deleteButton = $('#listing-delete');

        const fields = {
            title: $('#listing-title'),
            category: $('#listing-category'),
            size: $('#listing-size'),
            description: $('#listing-description'),
            price: $('#listing-price'),
            condition: $('#listing-condition')
        };

        const imageInput = $('#listing-image');
        const imageDropzone = $('#listing-image-dropzone');
        const imageError = $('#listing-image-error');
        const photoGrid = $('#listing-photo-grid');
        const dropzoneTitle = $('.image-dropzone-text strong', imageDropzone);
        const dropzoneHint = $('.image-dropzone-text small', imageDropzone);

        const DROPZONE_HINT =
            'Drag and drop or browse · JPG, PNG or WebP · up to 5 MB each';

        let editingId = null;

        /* a list of photos. Each entry is either a saved path
           ("uploads/abc.jpg") or a new photo that is not saved yet
           (a "data:" string). The FIRST one is the cover. */
        let images = [];

        let imageToken = 0;
        let dialogToken = 0;
        let saving = false;
        let processingImage = false;

        const formError = el('p', 'field-error');
        formError.id = 'listing-form-error';
        formError.setAttribute('role', 'alert');
        form.insertBefore(formError, $('.modal-actions', form));

        function setFormError(message) {
            formError.textContent = message;
        }

        function setError(input, message) {
            const errorElement = document.getElementById(input.id + '-error');

            errorElement.textContent = message;
            input.classList.toggle('is-invalid', message !== '');

            input.setAttribute(
                'aria-invalid',
                message !== '' ? 'true' : 'false'
            );

            return message === '';
        }

        function clearErrors() {
            Object.keys(fields).forEach(function (key) {
                setError(fields[key], '');
            });

            setImageError('');
            setFormError('');
        }

        function setImageError(message) {
            imageError.textContent = message;
        }

        function setProcessing(isProcessing) {
            processingImage = isProcessing;
            saveButton.disabled = processingImage || saving;
        }

        /* PHOTO GRID */
        function renderPhotos() {
            photoGrid.textContent = '';

            images.forEach(function (src, index) {
                const item = el(
                    'div',
                    'photo-item' + (index === 0 ? ' is-cover' : '')
                );

                const img = document.createElement('img');
                img.alt = 'Photo ' + (index + 1) + ' of your item';
                img.src = src;
                item.appendChild(img);

                if (index === 0) {
                    item.appendChild(el('span', 'photo-cover-badge', 'Cover'));
                }

                const remove = el('button', 'photo-remove');
                remove.type = 'button';
                remove.setAttribute('data-photo-remove', String(index));
                remove.setAttribute('aria-label', 'Remove photo ' + (index + 1));
                remove.innerHTML =
                    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                    '<path d="M6 6l12 12M18 6 6 18"></path></svg>';
                item.appendChild(remove);

                if (index > 0) {
                    const makeCover = el('button', 'photo-make-cover', 'Make cover');
                    makeCover.type = 'button';
                    makeCover.setAttribute('data-photo-cover', String(index));
                    makeCover.setAttribute(
                        'aria-label',
                        'Make photo ' + (index + 1) + ' the cover'
                    );
                    item.appendChild(makeCover);
                }

                photoGrid.appendChild(item);
            });

            photoGrid.hidden = images.length === 0;

            const full = images.length >= MAX_IMAGES;

            imageDropzone.hidden = full;

            dropzoneTitle.textContent =
                images.length === 0 ? 'Add photos' : 'Add more photos';

            dropzoneHint.textContent =
                images.length === 0
                    ? DROPZONE_HINT
                    : DROPZONE_HINT + ' · ' + images.length + ' of ' + MAX_IMAGES + ' added';
        }

        photoGrid.addEventListener('click', function (event) {
            const removeButton = event.target.closest('[data-photo-remove]');
            const coverButton = event.target.closest('[data-photo-cover]');

            if (removeButton) {
                const index = Number(removeButton.getAttribute('data-photo-remove'));

                if (index >= 0 && index < images.length) {
                    images.splice(index, 1);
                    setImageError('');
                    renderPhotos();
                }

                return;
            }

            if (coverButton) {
                const index = Number(coverButton.getAttribute('data-photo-cover'));

                if (index > 0 && index < images.length) {
                    const picked = images.splice(index, 1)[0];
                    images.unshift(picked);
                    renderPhotos();
                }
            }
        });

        function resizeImage(file) {
            return new Promise(function (resolve, reject) {
                const url = URL.createObjectURL(file);
                const img = new Image();

                img.onload = function () {
                    URL.revokeObjectURL(url);

                    let width = img.naturalWidth;
                    let height = img.naturalHeight;

                    if (!width || !height) {
                        reject(new Error('Empty image'));
                        return;
                    }

                    const scale = Math.min(
                        1,
                        MAX_IMAGE_EDGE / Math.max(width, height)
                    );

                    width = Math.max(1, Math.round(width * scale));
                    height = Math.max(1, Math.round(height * scale));

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const context = canvas.getContext('2d');
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, width, height);
                    context.drawImage(img, 0, 0, width, height);

                    try {
                        resolve(
                            canvas.toDataURL('image/jpeg', IMAGE_QUALITY)
                        );
                    } catch (error) {
                        reject(error);
                    }
                };

                img.onerror = function () {
                    URL.revokeObjectURL(url);
                    reject(new Error('Image could not be loaded'));
                };

                img.src = url;
            });
        }

        /* handles one OR many files (browse or drag and drop) */
        function handleImageFiles(fileList) {
            setImageError('');

            const files = Array.prototype.slice.call(fileList || []);

            /* the files are copied, so the input can be cleared right away */
            imageInput.value = '';

            if (files.length === 0) return;

            const room = MAX_IMAGES - images.length;

            if (room <= 0) {
                setImageError('You can add up to ' + MAX_IMAGES + ' photos.');
                return;
            }

            let notice = '';
            const accepted = [];

            files.forEach(function (file) {
                if (ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
                    notice = notice ||
                        'Only JPG, PNG or WebP photos can be added.';
                    return;
                }

                if (file.size > MAX_IMAGE_BYTES) {
                    notice = notice ||
                        'A photo was skipped because it is over 5 MB.';
                    return;
                }

                accepted.push(file);
            });

            if (accepted.length > room) {
                accepted.length = room;
                notice = 'You can add up to ' + MAX_IMAGES +
                    ' photos. The extra photos were skipped.';
            }

            if (accepted.length === 0) {
                setImageError(notice);
                return;
            }

            imageToken += 1;
            const token = imageToken;
            let unreadable = 0;

            setProcessing(true);

            /* the photos are processed one after another, in the order picked */
            let chain = Promise.resolve();

            accepted.forEach(function (file) {
                chain = chain.then(function () {
                    if (token !== imageToken) return null;

                    return resizeImage(file)
                        .then(function (dataUrl) {
                            if (token !== imageToken) return;

                            if (images.length < MAX_IMAGES) {
                                images.push(dataUrl);
                                renderPhotos();
                            }
                        })
                        .catch(function () {
                            unreadable += 1;
                        });
                });
            });

            chain.then(function () {
                if (token !== imageToken) return;

                setProcessing(false);

                if (unreadable > 0) {
                    setImageError(
                        'We could not read ' +
                        (unreadable === 1 ? 'one photo' : unreadable + ' photos') +
                        '. Please try a different file.'
                    );
                } else if (notice) {
                    setImageError(notice);
                }
            });
        }

        imageInput.addEventListener('change', function () {
            handleImageFiles(imageInput.files);
        });

        ['dragenter', 'dragover'].forEach(function (name) {
            imageDropzone.addEventListener(name, function (event) {
                event.preventDefault();
                imageDropzone.classList.add('is-dragover');
            });
        });

        ['dragleave', 'dragend'].forEach(function (name) {
            imageDropzone.addEventListener(name, function () {
                imageDropzone.classList.remove('is-dragover');
            });
        });

        imageDropzone.addEventListener('drop', function (event) {
            event.preventDefault();
            imageDropzone.classList.remove('is-dragover');

            handleImageFiles(event.dataTransfer && event.dataTransfer.files);
        });

        /* FORM VALIDATION */
        const validators = {
            title: function () {
                const value = fields.title.value.trim();

                if (value === '') {
                    return setError(fields.title, 'Please enter an item name.');
                }

                if (value.length < 2) {
                    return setError(fields.title, 'Item name is too short.');
                }

                return setError(fields.title, '');
            },

            category: function () {
                return setError(
                    fields.category,
                    fields.category.value === ''
                        ? 'Please choose a category.'
                        : ''
                );
            },

            size: function () {
                return setError(
                    fields.size,
                    fields.size.value.trim().length > 12
                        ? 'Size is too long.'
                        : ''
                );
            },

            description: function () {
                const value = fields.description.value.trim();

                if (value === '') {
                    return setError(
                        fields.description,
                        'Please enter a description of the item.'
                    );
                }

                if (value.length > 1000) {
                    return setError(
                        fields.description,
                        'Description must be 1000 characters or fewer.'
                    );
                }

                return setError(fields.description, '');
            },

            price: function () {
                const raw = fields.price.value.trim();

                if (raw === '') {
                    return setError(fields.price, 'Please enter a price.');
                }

                const value = Number(raw);

                if (!Number.isFinite(value) || value < 0) {
                    return setError(
                        fields.price,
                        'Enter a valid price (0 or more).'
                    );
                }

                if (value > 1000000) {
                    return setError(fields.price, 'Price is too high.');
                }

                return setError(fields.price, '');
            },

            condition: function () {
                const valid = ALLOWED_CONDITIONS.indexOf(
                    fields.condition.value
                ) !== -1;

                return setError(
                    fields.condition,
                    valid ? '' : 'Please choose an item condition.'
                );
            }
        };

        Object.keys(fields).forEach(function (key) {
            fields[key].addEventListener('blur', validators[key]);

            fields[key].addEventListener('input', function () {
                if (fields[key].classList.contains('is-invalid')) {
                    validators[key]();
                }
            });

            fields[key].addEventListener('change', function () {
                if (fields[key].classList.contains('is-invalid')) {
                    validators[key]();
                }
            });
        });

        function openDialog(item) {
            editingId = item ? item.id : null;
            dialogToken += 1;

            form.reset();
            clearErrors();

            imageToken += 1;
            setProcessing(false);
            imageInput.value = '';

            /* start with every photo the item already has */
            if (item && item.images && item.images.length) {
                images = item.images.slice();
            } else if (item && item.image) {
                images = [item.image];
            } else {
                images = [];
            }

            renderPhotos();

            titleEl.textContent = item ? 'Edit listing' : 'New listing';

            saveButton.textContent = item
                ? 'Save changes'
                : 'Save listing';

            deleteButton.hidden = !item;
            deleteButton.disabled = saving;

            if (item) {
                fields.title.value = item.title;
                fields.category.value = item.category;
                fields.size.value = item.size || '';
                fields.description.value = item.description || '';
                fields.price.value = String(item.price);

                fields.condition.value =
                    ALLOWED_CONDITIONS.indexOf(item.condition) !== -1
                        ? item.condition
                        : 'Good';
            } else {
                fields.description.value = '';
                fields.condition.value = 'Good';
            }

            dialog.showModal();
            fields.title.focus();
        }

        $('#new-listing-btn').addEventListener('click', function () {
            openDialog(null);
        });

        $('#listing-list').addEventListener('click', function (event) {
            const button = event.target.closest('[data-edit-id]');

            if (!button) return;

            const item = listings.filter(function (entry) {
                return entry.id === button.getAttribute('data-edit-id');
            })[0];

            if (item) openDialog(item);
        });

        $$('[data-dialog-close]', dialog).forEach(function (button) {
            button.addEventListener('click', function () {
                dialog.close();
            });
        });

        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) dialog.close();
        });

        /* SAVE LISTING */
        form.addEventListener('submit', function (event) {
            event.preventDefault();

            if (saving || processingImage) return;

            let valid = true;
            let firstInvalid = null;

            Object.keys(validators).forEach(function (key) {
                if (!validators[key]()) {
                    valid = false;

                    if (!firstInvalid) {
                        firstInvalid = fields[key];
                    }
                }
            });

            if (!valid) {
                firstInvalid.focus();
                return;
            }

            /* sends every photo (cover first) as "images".
               "image" (the cover) is still sent for older code. */
            const values = {
                title: fields.title.value.trim(),
                category: fields.category.value,
                size: fields.size.value.trim(),
                description: fields.description.value.trim(),
                price: Math.round(Number(fields.price.value) * 100) / 100,
                condition: fields.condition.value,
                images: images.slice(),
                image: images[0] || ''
            };

            const wasEditing = editingId;
            const token = dialogToken;
            const idleLabel = saveButton.textContent;

            const payload = Object.assign(
                { action: wasEditing ? 'update' : 'create' },
                values
            );

            if (wasEditing) payload.id = wasEditing;

            setFormError('');
            saving = true;
            saveButton.disabled = true;
            saveButton.textContent = 'Saving…';

            postJson(payload)
                .then(function (data) {
                    const saved = normalizeListing(data.listing);

                    if (!listingsLoaded) {
                        loadListings();
                    } else if (wasEditing) {
                        listings = listings.map(function (item) {
                            return item.id === saved.id ? saved : item;
                        });
                    } else {
                        listings = [saved].concat(listings);
                    }

                    renderListings();

                    if (token === dialogToken && dialog.open) {
                        dialog.close();
                    }
                })
                .catch(function (error) {
                    console.error('Unable to save the listing.', error);

                    if (token === dialogToken) {
                        setFormError(errorMessage(error));
                    }
                })
                .then(function () {
                    saving = false;

                    if (token === dialogToken) {
                        saveButton.textContent = idleLabel;
                    }

                    saveButton.disabled = processingImage;
                });
        });

        /* DELETE LISTING */
        deleteButton.addEventListener('click', function () {
            if (!editingId || saving) return;

            if (!window.confirm('Delete this listing? This cannot be undone.')) {
                return;
            }

            const idToDelete = editingId;
            const token = dialogToken;

            setFormError('');
            saving = true;
            deleteButton.disabled = true;
            saveButton.disabled = true;

            postJson({ action: 'delete', id: idToDelete })
                .then(function () {
                    listings = listings.filter(function (item) {
                        return item.id !== idToDelete;
                    });

                    renderListings();

                    if (token === dialogToken && dialog.open) {
                        dialog.close();
                    }
                })
                .catch(function (error) {
                    console.error('Unable to delete the listing.', error);

                    if (token === dialogToken) {
                        setFormError(errorMessage(error));
                    }
                })
                .then(function () {
                    saving = false;
                    deleteButton.disabled = false;
                    saveButton.disabled = processingImage;
                });
        });
    }

    /* INIT */
    setupGreeting();
    setupSidebar();
    setupTabs();
    renderListings();
    renderOrders();
    renderPayouts();
    setupTransfer();
    setupListingDialog();

    /* load the shared wallet balance + activity, and keep it fresh */
    loadWallet();

    /* NEW: load the real orders, and keep them fresh */
    loadOrders();

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            loadWallet();
            loadOrders();
        }
    });

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            loadWallet();
            loadOrders();
        }
    });

    showListingsMessage('Loading your listings…');
    loadListings();
})();
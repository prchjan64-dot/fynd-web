(() => {
  'use strict';

  /* ---------- Settings (edit these) ---------- */
  const CART_KEY = 'fynd_cart';         // only used when the visitor is not logged in
  const CART_API = 'cart.php';          // the cart of a logged-in user (MySQL: cart_items)
  const SHIPPING_FEE = 80;              // keep in sync with CHECKOUT_SHIPPING_FEE in checkout.php
  const SERVICE_FEE = 20;               // keep in sync with CHECKOUT_SERVICE_FEE in checkout.php
  const CHECKOUT_URL = 'checkout.php';  // POST endpoint that pays for the selected items
  const TAG = '[cart]';

  /* ---------- Helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const peso = n => '₱ ' + Math.round(n).toLocaleString('en-PH');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* ---------- Tab switching (makes the Cart tab work) ---------- */
  const views = $$('[data-dashboard-view]');
  const tabs = $$('.profile-tabs .tab');

  function showView(name) {
    if (!views.some(v => v.dataset.dashboardView === name)) return;
    views.forEach(v => { v.hidden = v.dataset.dashboardView !== name; });
    tabs.forEach(t => {
      const on = t.dataset.view === name;
      t.classList.toggle('active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-view]');
    if (el) setTimeout(() => showView(el.dataset.view), 0);
  }, true);
  window.addEventListener('hashchange', () => setTimeout(() => showView(location.hash.slice(1)), 0));
  document.addEventListener('DOMContentLoaded', () => {
    if (location.hash === '#cart') setTimeout(() => showView('cart'), 0);
  });

  /* ---------- Cart elements ---------- */
  const list = $('#cartList');
  if (!list) return;

  const selectAll = $('#cartSelectAll');
  const emptyMsg = $('#cartEmpty');
  const checkoutBtn = $('#cartCheckout');

  let items = [];          // the cart lines shown on the page
  let useServer = true;    // false only when the visitor is not logged in
  let checkingOut = false; // true while a checkout request is running

  /* ---------- Server helper ---------- */
  async function api(url, options) {
    const opts = options || {};
    const init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    };

    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    const res = await fetch(url, init);
    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      const parseError = new Error(url + ' did not return JSON. It returned: ' + text.slice(0, 120));
      parseError.status = res.status;
      throw parseError;
    }

    if (!res.ok || !data || data.ok !== true) {
      let message = (data && (data.error || data.message)) || ('HTTP ' + res.status);
      if (data && data.detail) message += ' (' + data.detail + ')';
      const apiError = new Error(message);
      apiError.status = res.status;
      throw apiError;
    }

    return data;
  }

  /* A small message above the cart list.
     Red by default; pass isSuccess = true for a green message. */
  function showError(text, isSuccess) {
    let box = $('#cartError');

    if (!text) {
      if (box) box.remove();
      return;
    }

    if (!box) {
      box = document.createElement('p');
      box.id = 'cartError';
      box.setAttribute('role', 'alert');
      list.parentNode.insertBefore(box, list);
    }

    box.style.cssText = 'margin:0 0 12px;font-size:14px;color:' + (isSuccess ? '#1b6e2d' : '#b3261e') + ';';
    box.textContent = text;
  }

  /* ---------- Cart data ---------- */
  function normalizeItem(i) {
    return {
      id: String(i.id),
      name: String(i.name || 'Item'),
      shop: String(i.shop || 'FYND seller'),
      size: String(i.size || ''),
      price: Number(i.price) || 0,
      image: i.image ? String(i.image) : ''
    };
  }

  /* Browser cart (visitors who are not logged in) */
  function readLocalCart() {
    try {
      const data = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(data)) return [];
      return data
        .filter(i => i && i.id !== undefined && i.id !== null)
        .map(normalizeItem);
    } catch (e) { return []; }
  }

  function saveLocalCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items.map(({ selected, ...rest }) => rest)));
    } catch (e) { /* storage unavailable: the cart still works for this visit */ }
  }

  /* Items left in the browser cart are moved into the account (once). */
  async function mergeLocalCart() {
    const local = readLocalCart();
    if (!local.length) return;

    const lines = local
      .map(i => ({ product_id: parseInt(i.id, 10) }))
      .filter(i => i.product_id > 0);

    try {
      if (lines.length) {
        await api(CART_API, { method: 'POST', body: { action: 'merge', items: lines } });
      }
      localStorage.removeItem(CART_KEY);
    } catch (e) {
      /* 401 = not logged in: the browser cart stays as it is */
      console.warn(TAG, 'Could not move the browser cart to your account:', e.message);

      /* FIXED: any other failure used to be silent, so items saved in this
         browser simply never showed up. Now the reason is shown. */
      if (e.status !== 401) {
        showError('Items saved in this browser could not be moved to your account: ' + e.message);
      }
    }
  }

  /* Keeps the "selected" tick of lines that were already on the page. */
  function applyItems(fresh) {
    const picked = new Map(items.map(i => [i.id, i.selected]));
    items = fresh.map(i => ({ ...i, selected: picked.has(i.id) ? picked.get(i.id) : true }));
    renderList();
    update();
  }

  async function loadItems() {
    try {
      const data = await api(CART_API);
      useServer = true;
      applyItems((data.items || []).map(normalizeItem));
    } catch (e) {
      if (e.status === 401) {
        useServer = false;
        applyItems(readLocalCart());
      } else {
        console.error(TAG, e.message);
        showError('We could not load your cart. ' + e.message);
        update();
        emptyMsg.hidden = true;
      }
    }
  }

  /* ---------- Cart ---------- */
  function renderList() {
    list.innerHTML = items.map((it, idx) => `
      <li class="cart-item" data-id="${esc(it.id)}">
        <label class="cart-check"><input type="checkbox" class="cart-item-check" aria-label="Select ${esc(it.name)}"><span class="cart-box"></span></label>
        ${it.image
        ? `<div class="cart-tile cart-has-img" aria-hidden="true"><img src="${esc(it.image)}" alt=""></div>`
        : `<div class="cart-tile cart-t${idx % 3 + 1}" aria-hidden="true">${esc(it.name.charAt(0))}</div>`}
        <div class="cart-info"><strong>${esc(it.name)}</strong><span>${esc(it.shop)}${it.size ? ' · ' + esc(it.size) : ''}</span></div>
        <strong class="cart-price"></strong>
        <button type="button" class="cart-remove" data-act="remove" aria-label="Remove ${esc(it.name)}">×</button>
      </li>`).join('');
  }

  function update() {
    let subtotal = 0, picked = 0;
    items.forEach(it => {
      const li = $(`.cart-item[data-id="${CSS.escape(it.id)}"]`, list);
      if (!li) return;
      $('.cart-price', li).textContent = peso(it.price);
      $('.cart-item-check', li).checked = it.selected;
      li.classList.toggle('unselected', !it.selected);
      if (it.selected) { subtotal += it.price; picked++; }
    });

    const shipping = picked ? SHIPPING_FEE : 0;
    const fee = picked ? SERVICE_FEE : 0;

    $('#cartSubtotal').textContent = peso(subtotal);
    $('#cartShipping').textContent = peso(shipping);
    $('#cartService').textContent = peso(fee);
    $('#cartTotal').textContent = peso(subtotal + shipping + fee);

    selectAll.checked = items.length > 0 && picked === items.length;
    selectAll.indeterminate = picked > 0 && picked < items.length;
    $('#cartSelectAllWrap').hidden = items.length === 0;
    emptyMsg.hidden = items.length > 0;
    checkoutBtn.disabled = picked === 0 || checkingOut;
    $('#cartCheckoutLabel').textContent = checkingOut
      ? 'Processing…'
      : (picked ? `Checkout (${picked})` : 'Checkout');
  }

  const itemOf = el => {
    const li = el.closest('.cart-item');
    return li ? items.find(i => i.id === li.dataset.id) : null;
  };

  async function removeItem(it) {
    items = items.filter(i => i !== it);
    renderList();
    update();

    if (!useServer) { saveLocalCart(); return; }

    try {
      await api(CART_API, {
        method: 'POST',
        body: { action: 'remove', product_id: parseInt(it.id, 10) }
      });
      showError('');
    } catch (e) {
      console.error(TAG, e.message);
      showError('Could not remove the item: ' + e.message);
      loadItems();
    }
  }

  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    const it = btn && itemOf(btn);
    if (!it) return;

    if (btn.dataset.act === 'remove') removeItem(it);
  });

  list.addEventListener('change', e => {
    if (!e.target.matches('.cart-item-check')) return;
    itemOf(e.target).selected = e.target.checked;
    update();
  });

  selectAll.addEventListener('change', () => {
    items.forEach(i => { i.selected = selectAll.checked; });
    update();
  });

  /* ---------- Checkout ----------
     FIXED: this used to navigate to checkout.php?items=... (a GET request),
     but checkout.php only accepts POST, so it answered "Use POST."
     Now the selected product ids are sent with fetch() as a POST. */
  checkoutBtn.addEventListener('click', async () => {
    if (checkingOut) return;

    const ids = items
      .filter(i => i.selected)
      .map(i => parseInt(i.id, 10))
      .filter(id => id > 0);

    if (!ids.length) return;

    checkingOut = true;
    showError('');
    update();

    try {
      const data = await api(CHECKOUT_URL, {
        method: 'POST',
        body: { items: ids }
      });

      showError(
        (data.message || 'Payment successful!') +
        (data.order_id ? ' Order #' + data.order_id + '.' : ''),
        true
      );

      await loadItems();   // the purchased items are gone from the cart now

      /* Reload so the wallet balance on the Profile and Credit tabs refreshes.
         The #cart hash keeps the Cart tab open. */
      setTimeout(() => {
        window.location.hash = 'cart';
        window.location.reload();
      }, 1800);
    } catch (e) {
      console.error(TAG, e.message);
      showError('Checkout failed: ' + e.message);
      checkingOut = false;
      update();
    }
  });

  /* Cart changed in another tab */
  window.addEventListener('storage', e => {
    if (e.key !== CART_KEY || useServer) return;   // browser cart only
    applyItems(readLocalCart());
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && useServer) loadItems();
  });

  window.addEventListener('pageshow', e => {
    if (e.persisted) loadItems();
  });

  /* Lets the Saved tab (JS/profile-saved.js) refresh the cart after "Add to cart". */
  window.fyndCart = { reload: loadItems };

  /* Start: move any browser cart into the account, then load the cart. */
  mergeLocalCart().then(loadItems);
})();
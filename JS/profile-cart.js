(() => {
  'use strict';

  /* ---------- Settings (edit these) ---------- */
  const CART_KEY = 'fynd_cart';         // only used when the visitor is not logged in
  const CART_API = 'cart.php';          // the cart of a logged-in user (MySQL: cart_items)
  const SHIPPING_FEE = 80;
  const SERVICE_FEE = 20;
  const CHECKOUT_URL = 'checkout.php';  // your checkout page
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
      let message = (data && data.error) || ('HTTP ' + res.status);
      if (data && data.detail) message += ' (' + data.detail + ')';
      const apiError = new Error(message);
      apiError.status = res.status;
      throw apiError;
    }

    return data;
  }

  /* A small red message above the cart list when something could not be saved. */
  function showError(text) {
    let box = $('#cartError');

    if (!text) {
      if (box) box.remove();
      return;
    }

    if (!box) {
      box = document.createElement('p');
      box.id = 'cartError';
      box.setAttribute('role', 'alert');
      box.style.cssText = 'margin:0 0 12px;color:#b3261e;font-size:14px;';
      list.parentNode.insertBefore(box, list);
    }

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
      qty: Math.min(99, Math.max(1, parseInt(i.qty, 10) || 1)),
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
      .map(i => ({ product_id: parseInt(i.id, 10), quantity: i.qty }))
      .filter(i => i.product_id > 0);

    try {
      if (lines.length) {
        await api(CART_API, { method: 'POST', body: { action: 'merge', items: lines } });
      }
      localStorage.removeItem(CART_KEY);
    } catch (e) {
      /* 401 = not logged in: the browser cart stays as it is */
      console.warn(TAG, 'Could not move the browser cart to your account:', e.message);
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
        <div class="cart-qty">
          <button type="button" class="cart-qty-btn" data-act="minus" aria-label="Decrease quantity">−</button>
          <span class="cart-qty-val" aria-live="polite"></span>
          <button type="button" class="cart-qty-btn" data-act="plus" aria-label="Increase quantity">+</button>
        </div>
        <strong class="cart-price"></strong>
        <button type="button" class="cart-remove" data-act="remove" aria-label="Remove ${esc(it.name)}">×</button>
      </li>`).join('');
  }

  function update() {
    let subtotal = 0, picked = 0;
    items.forEach(it => {
      const li = $(`.cart-item[data-id="${CSS.escape(it.id)}"]`, list);
      if (!li) return;
      $('.cart-qty-val', li).textContent = it.qty;
      $('.cart-price', li).textContent = peso(it.price * it.qty);
      $('[data-act="minus"]', li).disabled = it.qty <= 1;
      $('.cart-item-check', li).checked = it.selected;
      li.classList.toggle('unselected', !it.selected);
      if (it.selected) { subtotal += it.price * it.qty; picked++; }
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
    checkoutBtn.disabled = picked === 0;
    $('#cartCheckoutLabel').textContent = picked ? `Checkout (${picked})` : 'Checkout';
  }

  const itemOf = el => {
    const li = el.closest('.cart-item');
    return li ? items.find(i => i.id === li.dataset.id) : null;
  };

  /* Quantity changes are sent to the server after a short pause,
     so quickly pressing + or − does not send a request for every click. */
  const qtyTimers = {};

  function pushQty(it) {
    if (!useServer) { saveLocalCart(); return; }

    clearTimeout(qtyTimers[it.id]);
    qtyTimers[it.id] = setTimeout(async () => {
      try {
        await api(CART_API, {
          method: 'POST',
          body: { action: 'set_qty', product_id: parseInt(it.id, 10), quantity: it.qty }
        });
        showError('');
      } catch (e) {
        console.error(TAG, e.message);
        showError('Could not update your cart: ' + e.message);
        loadItems();
      }
    }, 400);
  }

  async function removeItem(it) {
    clearTimeout(qtyTimers[it.id]);
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

    if (btn.dataset.act === 'remove') { removeItem(it); return; }
    if (btn.dataset.act === 'plus') it.qty = Math.min(99, it.qty + 1);
    if (btn.dataset.act === 'minus') it.qty = Math.max(1, it.qty - 1);

    update();
    pushQty(it);
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

  checkoutBtn.addEventListener('click', () => {
    const ids = items.filter(i => i.selected).map(i => i.id);
    if (!ids.length) return;
    const qs = new URLSearchParams({ items: ids.join(',') });
    window.location.href = `${CHECKOUT_URL}?${qs}`;
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
(() => {
  'use strict';

  /* Fills the Orders tab with the logged-in user's real orders (orders.php).
     It reuses the existing order classes, so no CSS file needs to change. */

  const ORDERS_API = 'orders.php';
  const TAG = '[orders]';

  const list = document.getElementById('ordersList');
  if (!list) return;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const STATUS_LABELS = {
    paid: 'Paid',
    processing: 'Processing',
    shipped: 'In Transit',
    in_transit: 'In Transit',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
  };

  function statusLabel(status) {
    const key = String(status || '').toLowerCase();
    if (STATUS_LABELS[key]) return STATUS_LABELS[key];
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Paid';
  }

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(String(value).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  function note(text) {
    list.innerHTML = '<p style="margin:0;padding:18px 0;opacity:.7;">' + text + '</p>';
  }

  function orderNumber(id) {
    return '#FY-' + String(id).padStart(4, '0');
  }

  function renderOrder(order) {
    const items = order.items || [];
    const first = items[0];
    const extra = items.length > 1 ? ' +' + (items.length - 1) + ' more' : '';
    const title = first ? first.name + extra : 'Order';

    const sellers = [...new Set(items.map(i => i.shop).filter(Boolean))];
    const date = formatDate(order.created_at);
    const subtitle = [sellers.join(', '), 'Order ' + orderNumber(order.id), date]
      .filter(Boolean)
      .join(' · ');

    const label = statusLabel(order.status);
    const delivered = label === 'Delivered' ? ' delivered-status' : '';

    const lines = items.map(i =>
      '<p><strong>' + esc(i.name) + '</strong> × ' + esc(i.qty) + ' · ' + peso(i.price) +
      (i.shop ? ' · ' + esc(i.shop) : '') + '</p>'
    ).join('');

    return `
      <article class="full-order-item">
        <div class="full-order-icon" aria-hidden="true">♧</div>

        <div class="full-order-details">
          <strong>${esc(title)}</strong>
          <span>${esc(subtitle)}</span>
        </div>

        <span class="full-order-status${delivered}">${esc(label)}</span>
        <strong class="full-order-price">${peso(order.total)}</strong>

        <button class="order-details-button" type="button"
                aria-label="View details of order ${esc(orderNumber(order.id))}"
                aria-expanded="false"
                data-order-toggle="${esc(order.id)}">›</button>
      </article>

      <div class="order-extra-details" data-order-info="${esc(order.id)}" hidden>
        <p><strong>Status:</strong> ${esc(label)}</p>
        <p><strong>Order number:</strong> ${esc(orderNumber(order.id))}</p>
        ${lines}
        <p><strong>Total paid:</strong> ${peso(order.total)} <small>(items, shipping and service fee)</small></p>
      </div>`;
  }

  async function loadOrders() {
    try {
      const res = await fetch(ORDERS_API, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });

      const text = await res.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(ORDERS_API + ' did not return JSON: ' + text.slice(0, 120));
      }

      if (res.status === 401) {
        note('Please <a href="signin.html">sign in</a> to see your orders.');
        return;
      }

      if (!res.ok || !data || data.ok !== true) {
        throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
      }

      const orders = data.orders || [];

      if (!orders.length) {
        note('You have no orders yet. <a href="Fynd2.html">Find something to love</a>');
        return;
      }

      list.innerHTML = orders.map(renderOrder).join('');
    } catch (e) {
      console.error(TAG, e.message);
      note('We could not load your orders. ' + esc(e.message));
    }
  }

  /* Open / close the details of one order. */
  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-order-toggle]');
    if (!btn) return;

    const details = list.querySelector('[data-order-info="' + CSS.escape(btn.dataset.orderToggle) + '"]');
    if (!details) return;

    const open = details.hidden;
    details.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });

  /* Reload whenever the Orders tab is opened, so a new purchase shows up. */
  document.addEventListener('click', e => {
    if (e.target.closest('[data-view="orders"]')) setTimeout(loadOrders, 0);
  }, true);

  window.addEventListener('hashchange', () => {
    if (location.hash === '#orders') loadOrders();
  });

  window.addEventListener('pageshow', e => {
    if (e.persisted) loadOrders();
  });

  note('Loading your orders…');
  loadOrders();
})();

/* FYND Credit — xendit Checkout */
(() => {
  'use strict';

  const WALLET_URL = 'get-wallet.php';
  const ADD_URL = 'add-funds.php';
  const MAX_AMOUNT = 50000;

  const form = document.getElementById('creditForm');
  if (!form) return;

  const methodEl = document.getElementById('creditMethod');
  const amountEl = document.getElementById('creditAmount');
  const statusEl = document.getElementById('creditStatus');
  const verifyLabel = document.getElementById('creditVerifyLabel');
  const balanceEl = document.getElementById('creditBalance');

  let busy = false;

  const peso = value =>
    '₱ ' + Number(value).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  function setStatus(message, error = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.hidden = !message;
    statusEl.classList.toggle('is-error', error);
    statusEl.classList.toggle('is-success', !!message && !error);
  }

  async function loadBalance() {
    try {
      const response = await fetch(WALLET_URL, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error('Balance unavailable');
      }

      const formatted = peso(json.balance);

      document.querySelectorAll('[data-wallet-balance]').forEach(el => {
        el.textContent = formatted;
      });

      if (balanceEl) balanceEl.textContent = formatted;
    } catch {
      if (balanceEl) balanceEl.textContent = '₱ --';
    }
  }

  // Create the checkout confirmation popup automatically.
  const modal = document.createElement('div');
  modal.id = 'fyndPayxenditModal';
  modal.className = 'credit-confirm-overlay';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'fyndPayxenditTitle');

  modal.innerHTML = `
    <div class="credit-confirm-dialog">
      <h2 id="fyndPaymxenditTitle">Confirm wallet top-up</h2>
      <p>Payment method: <strong id="fyndPayxenditMethod"></strong></p>
      <p>Amount: <strong id="fyndPayxenditAmount"></strong></p>
      <p id="fyndPayxenditStatus" role="status" aria-live="polite" hidden></p>
      <button type="button" id="fyndPayxenditConfirm">
        Continue to Payxendit
      </button>
      <button type="button" id="fyndPayxenditCancel">
        Cancel
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  const modalMethod = modal.querySelector('#fyndPayxenditMethod');
  const modalAmount = modal.querySelector('#fyndPayxenditAmount');
  const modalStatus = modal.querySelector('#fyndPayxenditStatus');
  const modalConfirm = modal.querySelector('#fyndPayxenditConfirm');
  const modalCancel = modal.querySelector('#fyndPayxenditCancel');

  const methodNames = {
    gcash: 'GCash',
    maya: 'Maya',
    bdo: 'BDO',
    bpi: 'BPI',
    metrobank: 'Metrobank',
    unionbank: 'UnionBank'
  };

  function getPayment() {
    const method = methodEl?.value || '';
    const raw = amountEl?.value.trim() || '';
    const amount = Number(raw);

    if (!method) {
      setStatus('Please select a payment method.', true);
      methodEl?.focus();
      return null;
    }

    if (
      !raw ||
      !Number.isFinite(amount) ||
      amount < 1 ||
      amount > MAX_AMOUNT
    ) {
      setStatus('Enter an amount from ₱1 to ₱50,000.', true);
      amountEl?.focus();
      return null;
    }

    return {
      method,
      amount: Math.round(amount * 100) / 100
    };
  }

  function closeModal() {
    if (busy) return;
    modal.hidden = true;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;

    const payment = getPayment();
    if (!payment) return;

    setStatus('');
    modalMethod.textContent = methodNames[payment.method] || payment.method;
    modalAmount.textContent = peso(payment.amount);
    modalStatus.hidden = true;
    modalStatus.textContent = '';
    modalConfirm.disabled = false;
    modalConfirm.textContent = 'Continue to Payxendit';
    modal.hidden = false;
    modalConfirm.focus();
  });

  modalCancel.addEventListener('click', closeModal);

  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  modalConfirm.addEventListener('click', async () => {
    if (busy) return;

    const payment = getPayment();
    if (!payment) {
      modal.hidden = true;
      return;
    }

    busy = true;
    modalConfirm.disabled = true;
    modalCancel.disabled = true;
    modalConfirm.textContent = 'Connecting...';
    modalStatus.hidden = false;
    modalStatus.textContent = 'Creating secure checkout...';

    try {
      const response = await fetch(ADD_URL, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          method: payment.method,
          amount: payment.amount
        })
      });

      const json = await response.json();

      if (response.status === 401) {
        throw new Error('Please sign in again.');
      }

      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Checkout creation failed.');
      }

      if (!json.checkout_url) {
        throw new Error('The server did not return a checkout URL.');
      }

      const checkout = new URL(json.checkout_url);

if (
  checkout.protocol !== 'https:' ||
  !(
    checkout.hostname === 'checkout.xendit.co' ||
    checkout.hostname.endsWith('.xendit.co')
  )
) {
  throw new Error('Invalid Xendit checkout URL.');
}

modalStatus.textContent = 'Opening Xendit...';
window.location.assign(checkout.href);
    } catch (error) {
      modalStatus.textContent =
        error.message || 'Unable to open checkout.';
      modalConfirm.textContent = 'Try Again';
      modalConfirm.disabled = false;
    } finally {
      busy = false;
      modalCancel.disabled = false;
    }
  });

  if (verifyLabel) verifyLabel.textContent = 'Continue to Payment';

  loadBalance();

  window.addEventListener('hashchange', () => {
    if (location.hash === '#credit') loadBalance();
  });
})();

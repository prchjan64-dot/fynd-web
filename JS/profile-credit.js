/* ==========================================================
   profile-credit.js
   Credit tab: loads the wallet balance, checks the form, and when
   the user clicks Verify it adds the funds (add-funds.php) and shows
   the "Transfer Successfully!" screen.
   Load it after profile.js and profile-wallet.js.
========================================================== */
(() => {
  'use strict';

  const WALLET_URL = 'get-wallet.php';   // returns { success, balance }
  const ADD_URL    = 'add-funds.php';    // receives { method, account, amount }
  const MAX_AMOUNT = 50000;              // same limit as add-funds.php

  const form        = document.getElementById('creditForm');
  if (!form) return;

  const methodEl    = document.getElementById('creditMethod');
  const accountEl   = document.getElementById('creditAccount');
  const amountEl    = document.getElementById('creditAmount');
  const statusEl    = document.getElementById('creditStatus');
  const verifyBtn   = document.getElementById('creditVerify');
  const verifyLabel = document.getElementById('creditVerifyLabel');
  const balanceEl   = document.getElementById('creditBalance');
  const successEl   = document.getElementById('creditSuccess');
  const successText = document.getElementById('creditSuccessText');
  const doneBtn     = document.getElementById('creditDone');

  const MOBILE_METHODS = ['gcash', 'maya'];

  const peso = n =>
    '₱ ' + Number(n).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  let busy = false;

  /* ---------- Balance ---------- */

  function showBalance(value) {
    const text = peso(value);

    if (balanceEl) balanceEl.textContent = text;

    /* keep the "FYND credit" card on the Profile tab in step */
    document.querySelectorAll('[data-wallet-balance]').forEach(node => {
      node.textContent = text;
    });
  }

  async function loadBalance() {
    try {
      const res = await fetch(WALLET_URL, {
        cache: 'no-store',
        credentials: 'same-origin'
      });

      if (res.status === 401) {
        if (balanceEl) balanceEl.textContent = '₱ --';
        return;
      }

      const json = await res.json();

      if (!json.success) throw new Error('Request failed');

      showBalance(json.balance);
    } catch (err) {
      if (balanceEl) balanceEl.textContent = '₱ --';
    }
  }

  /* ---------- Status message ---------- */

  function setStatus(message, type) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.classList.remove('is-error', 'is-success');
      return;
    }

    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', type === 'error');
    statusEl.classList.toggle('is-success', type === 'success');
    statusEl.hidden = false;
  }

  function markInvalid(el, invalid) {
    el.classList.toggle('is-invalid', invalid);
    el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }

  function clearInvalid() {
    [methodEl, accountEl, amountEl].forEach(el => markInvalid(el, false));
  }

  /* ---------- Inputs ---------- */

  function isMobileMethod() {
    return MOBILE_METHODS.indexOf(methodEl.value) !== -1;
  }

  function updateAccountField() {
    if (isMobileMethod()) {
      accountEl.placeholder = '09XXXXXXXXX';
      accountEl.maxLength = 11;
      accountEl.value = accountEl.value.slice(0, 11);
    } else {
      accountEl.placeholder = 'Enter account number';
      accountEl.maxLength = 16;
    }
  }

  methodEl.addEventListener('change', () => {
    updateAccountField();
    markInvalid(methodEl, false);
    setStatus('');
  });

  /* digits only */
  accountEl.addEventListener('input', () => {
    accountEl.value = accountEl.value.replace(/\D/g, '');
    markInvalid(accountEl, false);
    setStatus('');
  });

  /* digits and one decimal point (max 2 decimals) */
  amountEl.addEventListener('input', () => {
    let value = amountEl.value.replace(/[^\d.]/g, '');
    const firstDot = value.indexOf('.');

    if (firstDot !== -1) {
      value = value.slice(0, firstDot + 1) +
        value.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
    }

    amountEl.value = value;
    markInvalid(amountEl, false);
    setStatus('');
  });

  /* ---------- Check the form ---------- */

  function validate() {
    clearInvalid();

    const errors = [];

    if (methodEl.value === '') {
      markInvalid(methodEl, true);
      errors.push('Please select an account.');
    }

    const account = accountEl.value.trim();

    if (account === '') {
      markInvalid(accountEl, true);
      errors.push('Please enter the account number.');
    } else if (isMobileMethod() && !/^09\d{9}$/.test(account)) {
      markInvalid(accountEl, true);
      errors.push('Enter an 11-digit mobile number starting with 09.');
    } else if (!isMobileMethod() && methodEl.value !== '' && !/^\d{10,16}$/.test(account)) {
      markInvalid(accountEl, true);
      errors.push('Enter a valid account number (10 to 16 digits).');
    }

    const rawAmount = amountEl.value.trim();
    const amount = Number(rawAmount);

    if (rawAmount === '') {
      markInvalid(amountEl, true);
      errors.push('Please enter an amount.');
    } else if (!Number.isFinite(amount) || amount < 1 || amount > MAX_AMOUNT) {
      markInvalid(amountEl, true);
      errors.push('Enter an amount between ₱1 and ₱' + MAX_AMOUNT.toLocaleString('en-PH') + '.');
    }

    if (errors.length) {
      setStatus(errors[0], 'error');

      const firstBad = form.querySelector('.is-invalid');
      if (firstBad) firstBad.focus();

      return null;
    }

    return {
      method: methodEl.value,
      account: account,
      amount: Math.round(amount * 100) / 100
    };
  }

  /* ---------- Verify ---------- */

  function setBusy(isBusy) {
    busy = isBusy;
    verifyBtn.disabled = isBusy;
    verifyLabel.textContent = isBusy ? 'Verifying…' : 'Verify';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (busy) return;

    const data = validate();
    if (!data) return;

    setStatus('');
    setBusy(true);

    try {
      let res;

      try {
        res = await fetch(ADD_URL, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(data)
        });
      } catch (networkError) {
        throw new Error('Could not reach the server. Please try again.');
      }

      let json = null;

      try {
        json = JSON.parse(await res.text());
      } catch (parseError) {
        json = null;
      }

      if (res.status === 401) {
        throw new Error('Please log in to add funds.');
      }

      if (!json || !res.ok || !json.success) {
        throw new Error(
          (json && json.message) || 'Something went wrong. Please try again.'
        );
      }

      showBalance(json.balance);

      successText.textContent =
        peso(data.amount) + ' was added to your FYND credit. ' +
        'New balance: ' + peso(json.balance) + '.';

      form.hidden = true;
      successEl.hidden = false;
      doneBtn.focus();
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  });

  /* ---------- Back to the form ---------- */

  doneBtn.addEventListener('click', () => {
    form.reset();
    clearInvalid();
    setStatus('');
    updateAccountField();

    successEl.hidden = true;
    form.hidden = false;
    methodEl.focus();
  });

  /* ---------- Start ---------- */

  updateAccountField();
  loadBalance();

  /* refresh when the Credit tab is opened */
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#credit') loadBalance();
  });
})();
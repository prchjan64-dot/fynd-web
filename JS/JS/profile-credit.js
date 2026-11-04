document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const ADD_FUNDS_URL = "add-funds.php";   // the PHP file below
    const MAX_AMOUNT = 50000;

    const creditView = document.getElementById("creditView");

    if (!creditView) {
        return;
    }

    const form = document.getElementById("creditForm");
    const methodSelect = document.getElementById("creditMethod");
    const accountInput = document.getElementById("creditAccount");
    const statusBox = document.getElementById("creditStatus");
    const verifyButton = document.getElementById("creditVerify");
    const verifyLabel = document.getElementById("creditVerifyLabel");
    const addFundsButton = document.getElementById("creditAddFunds");
    const balanceEl = document.getElementById("creditBalance");

    const amountBox = document.getElementById("creditAmountBox");
    const amountInput = document.getElementById("creditAmount");
    const confirmButton = document.getElementById("creditConfirm");
    const confirmLabel = document.getElementById("creditConfirmLabel");
    const chips = document.querySelectorAll(".credit-chip");

    const balanceSource = document.getElementById("walletBalance");

    let verified = false;

    const peso = (n) =>
        "₱ " +
        Number(n).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    /* =========================================
       1. WALLET BALANCE
          Mirrors the "FYND credit" card (loaded from MySQL
          by profile-wallet.js), so both always match.
    ========================================= */

    function syncBalance() {
        if (!balanceSource || !balanceEl) {
            return;
        }

        const text = balanceSource.textContent.trim();

        balanceEl.textContent =
            text && !text.includes("--") ? text : "₱ 0.00";
    }

    if (balanceSource) {
        syncBalance();

        new MutationObserver(syncBalance).observe(balanceSource, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    /* =========================================
       2. "ADD FUNDS" BUTTON
    ========================================= */

    if (addFundsButton) {
        addFundsButton.addEventListener("click", () => {
            if (form) {
                form.scrollIntoView({
                    behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)"
                    ).matches
                        ? "auto"
                        : "smooth",
                    block: "center"
                });
            }

            if (methodSelect) {
                methodSelect.focus({ preventScroll: true });
            }
        });
    }

    /* =========================================
       3. HELPERS
    ========================================= */

    const METHOD_NAMES = {
        gcash: "GCash",
        maya: "Maya",
        bdo: "BDO",
        bpi: "BPI",
        metrobank: "Metrobank",
        unionbank: "UnionBank"
    };

    function showStatus(message, type) {
        statusBox.textContent = message;
        statusBox.className = "credit-status";

        if (type) {
            statusBox.classList.add(`is-${type}`);
        }

        statusBox.hidden = false;
    }

    function clearStatus() {
        statusBox.hidden = true;
        statusBox.textContent = "";
        statusBox.className = "credit-status";
    }

    function markInvalid(element, isInvalid) {
        if (element) {
            element.classList.toggle("is-invalid", isInvalid);
        }
    }

    function validateAccount(method, digits) {
        if (method === "gcash" || method === "maya") {
            return /^09\d{9}$/.test(digits)
                ? ""
                : "Enter your 11-digit mobile number, starting with 09.";
        }

        return /^\d{10,16}$/.test(digits)
            ? ""
            : "Enter a valid bank account number (10 to 16 digits).";
    }

    /* Changing the method or number means it must be verified again */
    function resetVerification() {
        verified = false;
        amountBox.hidden = true;
        amountInput.value = "";
        chips.forEach((chip) => chip.classList.remove("is-active"));
        markInvalid(amountInput, false);
    }

    accountInput.addEventListener("input", () => {
        accountInput.value = accountInput.value.replace(/[^\d\s-]/g, "");
        markInvalid(accountInput, false);
        clearStatus();
        resetVerification();
    });

    methodSelect.addEventListener("change", () => {
        markInvalid(methodSelect, false);
        clearStatus();
        resetVerification();

        const isMobile =
            methodSelect.value === "gcash" || methodSelect.value === "maya";

        accountInput.placeholder = isMobile
            ? "09XX XXX XXXX"
            : "Enter account number";
    });

    /* =========================================
       4. STEP 1: VERIFY THE ACCOUNT
    ========================================= */

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const method = methodSelect.value;
        const digits = accountInput.value.replace(/\D/g, "");

        markInvalid(methodSelect, false);
        markInvalid(accountInput, false);

        if (!method) {
            markInvalid(methodSelect, true);
            showStatus("Please select a payment method.", "error");
            methodSelect.focus();
            return;
        }

        const problem = validateAccount(method, digits);

        if (problem) {
            markInvalid(accountInput, true);
            showStatus(problem, "error");
            accountInput.focus();
            return;
        }

        verifyButton.disabled = true;
        verifyLabel.textContent = "Verifying...";
        clearStatus();

        window.setTimeout(() => {
            verifyButton.disabled = false;
            verifyLabel.textContent = "Verify";
            verified = true;

            showStatus(
                `${METHOD_NAMES[method]} account verified. Enter how much you want to add.`,
                "success"
            );

            amountBox.hidden = false;
            amountInput.focus({ preventScroll: true });
        }, 600);
    });

    /* =========================================
       5. STEP 2: CHOOSE AN AMOUNT AND ADD IT
    ========================================= */

    chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            amountInput.value = chip.dataset.amount;
            markInvalid(amountInput, false);
            clearStatus();

            chips.forEach((c) => c.classList.toggle("is-active", c === chip));
        });
    });

    amountInput.addEventListener("input", () => {
        amountInput.value = amountInput.value
            .replace(/[^\d.]/g, "")
            .replace(/(\..*)\./g, "$1");

        markInvalid(amountInput, false);
        clearStatus();

        chips.forEach((chip) =>
            chip.classList.toggle(
                "is-active",
                chip.dataset.amount === amountInput.value
            )
        );
    });

    async function addFunds() {
        if (!verified) {
            showStatus("Please verify your account first.", "error");
            return;
        }

        const amount = Number(amountInput.value);

        if (!amountInput.value || !isFinite(amount) || amount < 1) {
            markInvalid(amountInput, true);
            showStatus("Enter an amount of at least ₱1.", "error");
            amountInput.focus();
            return;
        }

        if (amount > MAX_AMOUNT) {
            markInvalid(amountInput, true);
            showStatus(
                `You can add up to ${peso(MAX_AMOUNT)} at a time.`,
                "error"
            );
            amountInput.focus();
            return;
        }

        confirmButton.disabled = true;
        confirmLabel.textContent = "Adding...";
        clearStatus();

        try {
            const res = await fetch(ADD_FUNDS_URL, {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                },
                body: JSON.stringify({
                    method: methodSelect.value,
                    account: accountInput.value.replace(/\D/g, ""),
                    amount: Math.round(amount * 100) / 100
                })
            });

            if (res.status === 401) {
                showStatus("Please log in again to add funds.", "error");
                return;
            }

            const text = await res.text();
            let json;

            try {
                json = JSON.parse(text);
            } catch (e) {
                throw new Error(
                    "add-funds.php did not return JSON: " + text.slice(0, 120)
                );
            }

            if (!res.ok || !json.success) {
                throw new Error(json.message || "Request failed.");
            }

            /* Update both balance displays with the saved value */
            const formatted = peso(json.balance);

            if (balanceSource) {
                balanceSource.textContent = formatted;
            }

            balanceEl.textContent = formatted;

            showStatus(
                `${peso(amount)} was added to your wallet. New balance: ${formatted}`,
                "success"
            );

            resetVerification();
            accountInput.value = "";
            methodSelect.selectedIndex = 0;
            accountInput.placeholder = "Enter account number";

            document.dispatchEvent(
                new CustomEvent("fynd:funds-added", {
                    detail: { amount, balance: json.balance }
                })
            );
        } catch (err) {
            showStatus("Could not add funds: " + err.message, "error");
                } finally {
            if (confirmButton) {
                confirmButton.disabled = false;
            }

            if (confirmLabel) {
                confirmLabel.textContent = "Add to wallet";
            }
        }
    }

    if (confirmButton) {
        confirmButton.addEventListener("click", addFunds);
    }

    if (amountInput) {
        amountInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                addFunds();
            }
        });
    }
});
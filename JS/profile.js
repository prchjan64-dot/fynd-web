document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const prefersReducedMotion = () =>
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* =========================================
       1. MAIN SIDEBAR NAVIGATION
    ========================================= */

    const currentFile = window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

    const pageByFile = {
        "fynd2.html": "storefront",
        "buyer-dashboard.html": "buyer",
        "seller-studio.html": "seller",
        "profile.html": "profile",
        "profile.php": "profile"
    };

    const currentPage = pageByFile[currentFile];

    document.querySelectorAll(
        ".sidebar-nav .nav-link[data-page], .sidebar-account .nav-link[data-page]"
    ).forEach((link) => {
        const isActive =
            currentPage !== undefined &&
            link.dataset.page === currentPage;

        link.classList.toggle("active", isActive);

        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });

    /* =========================================
       1B. GREETING BY TIME OF DAY
           (same rules as Seller Studio)
           before 12:00  -> Good morning
           12:00 - 17:59 -> Good afternoon
           18:00 onward  -> Good evening
    ========================================= */

    function setupGreeting() {
        const greetingText = document.getElementById("greeting");
        const greetingName = document.getElementById("greeting-name");

        const hour = new Date().getHours();
        const greeting =
            hour < 12
                ? "Good morning"
                : hour < 18
                    ? "Good afternoon"
                    : "Good evening";

        if (greetingText) {
            greetingText.textContent = greeting;
        }

        if (greetingName) {
            const accountName = document.querySelector(
                ".sidebar-account-details strong"
            );

            const firstName = accountName
                ? accountName.textContent.trim().split(/\s+/)[0]
                : "";

            greetingName.textContent = firstName || "there";
        }
    }

    setupGreeting();

    /* =========================================
       2. PROFILE CONTENT VIEWS
    ========================================= */

    const tabs = document.querySelectorAll(".profile-tabs .tab");

    const views = {
        profile: document.getElementById("profileView"),
        orders: document.getElementById("ordersView"),
        saved: document.getElementById("savedView"),
        credit: document.getElementById("creditView")   // NEW: Credit tab
    };

    const isProfilePage = Object.values(views).some(Boolean);

    const notificationButton = document.getElementById("notificationButton");
    const closeNotificationsButton = document.getElementById("closeNotifications");
    const notificationPanel = document.getElementById("notificationPanel");

    const helpButtons = document.querySelectorAll("[data-open-help]");
    const closeHelpButton = document.getElementById("closeHelp");
    const helpPanel = document.getElementById("helpPanel");

    function closeNotificationPanel() {
        if (notificationPanel) {
            notificationPanel.hidden = true;
        }

        if (notificationButton) {
            notificationButton.setAttribute("aria-expanded", "false");
        }
    }

    function closeHelpPanel() {
        if (helpPanel) {
            helpPanel.hidden = true;
        }

        helpButtons.forEach((button) => {
            button.setAttribute("aria-expanded", "false");
        });
    }

    function closeOverlays() {
        closeNotificationPanel();
        closeHelpPanel();
    }

    function showView(viewName, updateHistory = true) {
        if (!Object.prototype.hasOwnProperty.call(views, viewName)) {
            return;
        }

        const targetView = views[viewName];

        if (!targetView) {
            return;
        }

        Object.entries(views).forEach(([name, view]) => {
            if (view) {
                view.hidden = name !== viewName;
            }
        });

        tabs.forEach((tab) => {
            const isActive = tab.dataset.view === viewName;

            tab.classList.toggle("active", isActive);

            if (isActive) {
                tab.setAttribute("aria-current", "page");
            } else {
                tab.removeAttribute("aria-current");
            }
        });

        closeOverlays();

        if (updateHistory) {
            const newHash = `#${viewName}`;

            if (window.location.hash !== newHash) {
                window.history.pushState(
                    { view: viewName },
                    "",
                    newHash
                );
            }
        }

        /* The page no longer scrolls to the top when the view changes,
           so nothing moves when switching tabs. */
    }

    /* =========================================
       3. PROFILE TAB CLICK EVENTS
    ========================================= */

    tabs.forEach((tab) => {
        tab.addEventListener("click", (event) => {
            event.preventDefault();
            showView(tab.dataset.view);
        });
    });

    /* =========================================
       4. LINKS THAT OPEN PROFILE VIEWS
    ========================================= */

    document.querySelectorAll("[data-view]").forEach((element) => {
        if (element.matches(".profile-tabs .tab")) {
            return;
        }

        element.addEventListener("click", (event) => {
            const viewName = element.dataset.view;

            if (!Object.prototype.hasOwnProperty.call(views, viewName)) {
                return;
            }

            event.preventDefault();
            showView(viewName);
        });
    });

    /* =========================================
       5. LOAD PROFILE VIEW FROM URL HASH
          (an old #payouts link falls back to Profile)
    ========================================= */

    function loadViewFromHash() {
        const requestedView = window.location.hash
            .slice(1)
            .toLowerCase();

        const viewName =
            Object.prototype.hasOwnProperty.call(views, requestedView) &&
            views[requestedView]
                ? requestedView
                : "profile";

        showView(viewName, false);
    }

    if (isProfilePage) {
        window.addEventListener("hashchange", loadViewFromHash);
        window.addEventListener("popstate", loadViewFromHash);
        loadViewFromHash();
    }

    /* =========================================
       6. NOTIFICATION PANEL
    ========================================= */

    if (notificationButton && notificationPanel) {
        notificationButton.addEventListener("click", (event) => {
            event.preventDefault();

            const shouldOpen = notificationPanel.hidden;
            notificationPanel.hidden = !shouldOpen;

            notificationButton.setAttribute("aria-expanded", String(shouldOpen));

            if (shouldOpen) {
                closeHelpPanel();
            }
        });
    }

    if (closeNotificationsButton) {
        closeNotificationsButton.addEventListener("click", (event) => {
            event.preventDefault();
            closeNotificationPanel();

            if (notificationButton) {
                notificationButton.focus({ preventScroll: true });
            }
        });
    }

    /* =========================================
       7. HELP PANEL
    ========================================= */

    helpButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();

            if (!helpPanel) {
                return;
            }

            const shouldOpen = helpPanel.hidden;
            helpPanel.hidden = !shouldOpen;

            helpButtons.forEach((item) => {
                item.setAttribute("aria-expanded", String(shouldOpen));
            });

            if (shouldOpen) {
                closeNotificationPanel();

                helpPanel.scrollIntoView({
                    behavior: prefersReducedMotion() ? "auto" : "smooth",
                    block: "nearest"
                });
            }
        });
    });

    if (closeHelpButton) {
        closeHelpButton.addEventListener("click", (event) => {
            event.preventDefault();
            closeHelpPanel();
        });
    }

    /* =========================================
       8. ORDER DETAILS TOGGLE
    ========================================= */

    document.querySelectorAll("[data-order-details]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();

            const detailsId = button.dataset.orderDetails;

            if (!detailsId) {
                return;
            }

            const details = document.querySelector(
                `[data-order-info="${detailsId}"]`
            );

            if (!details) {
                console.warn(
                    `FYND: Order details element "${detailsId}" was not found.`
                );
                return;
            }

            const shouldOpen = details.hidden;
            details.hidden = !shouldOpen;

            button.setAttribute("aria-expanded", String(shouldOpen));
        });
    });

    /* =========================================
       9. ESCAPE KEY CLOSES OVERLAYS
    ========================================= */

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeOverlays();
        }
    });
});
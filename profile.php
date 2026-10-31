
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FYND | Your Profile</title>
    <link rel="stylesheet" href="profile.css">
</head>
<body>

    <div class="dashboard">

        <!-- Sidebar -->
        <aside class="sidebar">
            <div class="sidebar-top">
                <div class="sidebar-label">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="4"></rect>
                        <path d="M9 3v18"></path>
                    </svg>
                    <span>Navigation</span>
                </div>

                <nav class="sidebar-nav" aria-label="Main navigation">
                    <a href="Fynd2.html" class="nav-link">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"></path>
                        </svg>
                        <span>Storefront</span>
                    </a>

                    <a href="buyer-dashboard.html" class="nav-link">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="3" y="3" width="7" height="7" rx="2"></rect>
                            <rect x="14" y="3" width="7" height="7" rx="2"></rect>
                            <rect x="3" y="14" width="7" height="7" rx="2"></rect>
                            <rect x="14" y="14" width="7" height="7" rx="2"></rect>
                        </svg>
                        <span>Buyer dashboard</span>
                    </a>

                    <a href="seller-studio.html" class="nav-link">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M5 8h14l2 4v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z"></path>
                            <path d="M8 8V5a4 4 0 0 1 8 0v3"></path>
                            <path d="M9 13h6"></path>
                        </svg>
                        <span>Seller Studio</span>
                    </a>
                </nav>
            </div>

            <a href="SignIn2.html" class="sidebar-account">
                <span class="avatar avatar-sidebar">R</span>
                <span class="sidebar-account-details">
                    <strong>Reina</strong>
                    <small>reina04@gmail.com</small>
                </span>
            </a>
        </aside>

        <!-- Main Dashboard -->
        <main class="main-content">

            <!-- Profile Header -->
            <header class="profile-header">
                <div class="welcome-section">
                    <div class="account-label">
                        <span class="avatar avatar-small">R</span>
                        <span>YOUR ACCOUNT</span>
                    </div>

                    <h1>Good morning,<br><span>Reina</span>.</h1>
                    <p class="welcome-description">
                        Here's what's happening with your FYNDs
                    </p>
                </div>

                <div class="header-actions">
                    <button class="notification-button" type="button"
                            aria-label="Notifications">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
                            <path d="M10 21h4"></path>
                        </svg>
                    </button>

                    <a href="index.html" class="continue-button">
                        <span>Continue<br>shopping</span>
                        <span class="continue-arrow" aria-hidden="true">↗</span>
                    </a>
                </div>
            </header>

            <!-- Profile Navigation -->
<nav class="profile-tabs" aria-label="Profile sections">
    <a href="#profile"
       class="tab active"
       data-view="profile"
       aria-current="page">
        Profile
    </a>

    <a href="#orders"
       class="tab"
       data-view="orders">
        Orders
    </a>

    <a href="#saved"
       class="tab"
       data-view="saved">
        Saved
    </a>

    <a href="#payouts"
       class="tab"
       data-view="payouts">
        Payouts
    </a>
</nav>

            <!-- Account Summary -->
            <section class="stats-grid" id="profile" data-dashboard-view="profile" aria-label="Account summary">

                <article class="stat-card stat-green">
                    <div class="stat-top">
                        <span class="stat-icon dark-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                                <rect x="4" y="7" width="16" height="14" rx="3"></rect>
                                <path d="M8 7V5a4 4 0 0 1 8 0v2"></path>
                            </svg>
                        </span>
                        <span class="stat-label">ALL TIME</span>
                    </div>
                    <div class="stat-bottom">
                        <strong class="stat-number">08</strong>
                        <p>Total orders</p>
                    </div>
                </article>

                <article class="stat-card">
                    <div class="stat-top">
                        <span class="stat-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                                <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"></path>
                            </svg>
                        </span>
                        <span class="stat-label">3 PRICE DROPS</span>
                    </div>
                    <div class="stat-bottom">
                        <strong class="stat-number">24</strong>
                        <p>Saved pieces</p>
                    </div>
                </article>

                <article class="stat-card">
                    <div class="stat-top">
                        <span class="stat-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                                <rect x="4" y="5" width="16" height="15" rx="3"></rect>
                                <path d="M8 5V3h8v2M8 10h8M8 14h5"></path>
                            </svg>
                        </span>
                        <span class="stat-label">READY TO USE</span>
                    </div>
                    <div class="stat-bottom">
                        <strong class="stat-number stat-currency">₱ 1,159.05</strong>
                        <p>FYND credit</p>
                    </div>
                </article>

                <article class="stat-card">
                    <div class="stat-top">
                        <span class="stat-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                                <path d="m12 2 2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z"></path>
                                <path d="m19 15 1.2 2.8L23 19l-2.8 1.2L19 23l-1.2-2.8L15 19l2.8-1.2z"></path>
                            </svg>
                        </span>
                        <span class="stat-label">KG KEPT IN USE</span>
                    </div>
                    <div class="stat-bottom">
                        <strong class="stat-number">96</strong>
                        <p>Impact score</p>
                    </div>
                </article>

            </section>

            <!-- Dashboard Panels -->
            <section class="dashboard-panels" data-dashboard-view="overview-panels">

                <!-- Recent Orders -->
                <div class="left-panels">
                    <article class="panel recent-orders" id="orders">
                        <div class="panel-heading">
                            <div>
                                <span class="panel-eyebrow">IN MOTION</span>
                                <h2>RECENT ORDERS</h2>
                            </div>
                            <a href="#orders" class="view-all">View all</a>
                        </div>

                        <div class="order-card">
                            <div class="order-product">
                                <div class="product-thumb denim-thumb" role="img"
                                     aria-label="Clothing item thumbnail"></div>
                                <div class="order-details">
                                    <strong>Cloudswift 3</strong>
                                    <span>Mid Studio · Order #FY-2408</span>
                                    <span class="order-status">IN TRANSIT</span>
                                </div>
                                <strong class="order-price">₱ 2,159</strong>
                            </div>

                            <div class="order-timeline">
                                <div class="timeline-step">
                                    <span class="timeline-dot">✓</span>
                                    <span>Order confirmed</span>
                                    <small>Sep 08</small>
                                </div>
                                <div class="timeline-step">
                                    <span class="timeline-dot">✓</span>
                                    <span>Packed by seller</span>
                                    <small>Sep 09</small>profile 
                                </div>
                                <div class="timeline-step">
                                    <span class="timeline-dot">•</span>
                                    <span>On the way</span>
                                    <small>Arrives Sep 11</small>
                                </div>
                            </div>
                        </div>
                    </article>

                    <article class="delivery-card">
                        <span class="delivery-icon" aria-hidden="true">↻</span>
                        <div class="delivery-details">
                            <strong>90s Straight Denim</strong>
                            <span>Delivered Aug 28 · ₱365</span>
                        </div>
                        <a href="#help" class="help-link">Need help?</a>
                    </article>
                </div>

                <!-- Saved Items -->
                <article class="panel saved-panel" id="saved">
                    <div class="panel-heading">
                        <div>
                            <span class="panel-eyebrow">FOR YOUR EDITS</span>
                            <h2>Saved for later</h2>
                        </div>
                        <span class="saved-star" aria-hidden="true">★</span>
                    </div>

                    <div class="saved-item">
                        <div class="saved-thumb blazer-thumb" role="img"
                             aria-label="Blazer thumbnail"></div>
                        <div class="saved-item-details">
                            <strong>Oversized Wool Blazer</strong>
                            <span>North Archive</span>
                        </div>
                        <strong class="saved-price">₱ 999</strong>
                    </div>

                    <div class="saved-item">
                        <div class="saved-thumb jacket-thumb" role="img"
                             aria-label="Leather jacket thumbnail"></div>
                        <div class="saved-item-details">
                            <strong>Rider Leather Jacket</strong>
                            <span>After Hours</span>
                        </div>
                        <strong class="saved-price">₱ 867</strong>
                    </div>

                    <a href="#saved" class="saved-action">
                        <span>Open your saved edit</span>
                        <span aria-hidden="true">↗</span>
                    </a>
                </article>


                
            </section>

            <!-- Payouts View -->
<section class="payouts-view"
         id="payouts"
         data-dashboard-view="payouts"
         aria-label="Payouts"
         hidden>

    <article class="payout-card">
        <span class="panel-eyebrow">AVAILABLE BALANCE</span>

        <strong class="payout-amount">₱30,618.45</strong>

        <p>Ready to transfer · next payout Jul 01</p>

        <button class="transfer-button"
                type="button"
                id="transferFunds">
            Transfer funds <span aria-hidden="true">↗</span>
        </button>
    </article>

    <article class="protection-card">
        <h2>
            <span aria-hidden="true">♢</span>
            Seller protection
        </h2>

        <p>
            Every order is covered by FYND's seller protection
            when you ship on time and describe your item honestly.
        </p>

        <p class="account-standing">
            <span aria-hidden="true">✓</span>
            Your account is in good standing
        </p>
    </article>

</section>

            <footer class="dashboard-footer" id="payouts">
                <span>FYND · Keep good pieces moving.</span>
                <a href="#help" id="help">Need help?</a>
            </footer>

             <section class="help-panel"
                id="help" role="region" aria-label="Help and support" hidden>
                    <div>
                        <h2>Need help?</h2>
                    <p>For order, account, or payout assistance, contact FYND support.</p>
    </div>

    <button type="button" id="closeHelp">Close</button>
</section>

        </main>
    </div>

    <script src="profile.js" defer></script>

</body>
</html>

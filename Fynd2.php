<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FYND Marketplace</title>

    <!-- Google Font: Montserrat -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="style.css">
    <link rel="icon" type="image/jpeg" href="image/logo2.0.jpg">
</head>

<body>

    <!-- Header -->
    <header>
        <img src="image/logo2.0.jpg" alt="FYND logo" class="logo">
        <h1 id="fynd"><span id="FYND">FYND </span>Marketplace</h1>

        <nav>
            <input type="text" placeholder="Search products...">
            <a href="sell-item-page.php">Sell an item</a>

            <!-- Profile icon -->
            <a href="profilepage.html" title="Profile" aria-label="Profile">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                     fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 6c-2.28 0-4 1.72-4 4s1.72 4 4 4 4-1.72 4-4-1.72-4-4-4m0 6c-1.18 0-2-.82-2-2s.82-2 2-2 2 .82 2 2-.82 2-2 2"></path>
                    <path d="M12 2C6.49 2 2 6.49 2 12c0 3.26 1.58 6.16 4 7.98V20h.03c1.67 1.25 3.73 2 5.97 2s4.31-.75 5.97-2H18v-.02c2.42-1.83 4-4.72 4-7.98 0-5.51-4.49-10-10-10M8.18 19.02C8.59 17.85 9.69 17 11 17h2c1.31 0 2.42.85 2.82 2.02-1.14.62-2.44.98-3.82.98s-2.69-.35-3.82-.98m9.3-1.21c-.81-1.66-2.51-2.82-4.48-2.82h-2c-1.97 0-3.66 1.16-4.48 2.82A7.96 7.96 0 0 1 4 11.99c0-4.41 3.59-8 8-8s8 3.59 8 8c0 2.29-.97 4.36-2.52 5.82"></path>
                </svg>
            </a>

            <!-- Cart icon -->
            <a href="cart-page.html" title="Cart" aria-label="Cart">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                     fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 4H6.17l-.18-1.15A1 1 0 0 0 5 2H2v2h2.14l1.87 12.15A1 1 0 0 0 7 17h12v-2H7.86l-.31-2H19c.45 0 .84-.3.96-.73l2-7A1 1 0 0 0 21 3.99Zm-2.75 7H7.24l-.77-5h13.2l-1.43 5ZM8 18a2 2 0 1 0 0 4 2 2 0 1 0 0-4m9 0a2 2 0 1 0 0 4 2 2 0 1 0 0-4"></path>
                </svg>
            </a>
        </nav>
    </header>

    <!-- Hero Section -->
    <section class="hero">

        <h4>Welcome to FYND - New Finds, Second Chances</h4>

        <div id="brand-quote">
            <h1>Find it. <br> Love it. <br> FYND it.</h1>
        </div>

        <p>From fresh pieces to second-hand gems, FYND is where things get another chance to be found, loved, and used. You never know what you'll FYND next.</p>

        <div class="hero-gallery">
            <img src="image/padayao.jpg" alt="BrandPhoto" class="brand-img">
            <img src="image/rj.jpg" alt="BrandPhoto2" class="brand-img">
        </div>

        <!-- Links styled as buttons (no <button> inside <a>) -->
        <a href="#Instructions" id="btn1">
            How It Works
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                 fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 8h-2v5.59l-6.29-6.3-1.42 1.42 6.3 6.29H8v2h9z"></path>
            </svg>
        </a>

        <a href="#products" id="btn2">
            Explore Items
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                 fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 8h-2v5.59l-6.29-6.3-1.42 1.42 6.3 6.29H8v2h9z"></path>
            </svg>
        </a>
    </section>

    <!-- Products -->
    <h1 id="products">FYND your next favorite.</h1>

    <div class="filters">
        <button type="button">All items</button>
        <button type="button">Shoes</button>
        <button type="button">Bags</button>
        <button type="button">Clothes</button>
        <button type="button">Gadgets</button>
        <button type="button">Supplies</button>
        <button type="button">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                 fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 11c1.86 0 3.41-1.28 3.86-3H22V6H9.86c-.45-1.72-2-3-3.86-3-2.21 0-4 1.79-4 4s1.79 4 4 4m0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2m12 16c2.21 0 4-1.79 4-4s-1.79-4-4-4c-1.86 0-3.41 1.28-3.86 3H2v2h12.14c.45 1.72 2 3 3.86 3m0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2"></path>
            </svg>
            Filters
        </button>
    </div>

    <div class="product">
    <div class="product-top">
        <span class="badge">New</span>
        <span class="icon">☆</span>
    </div>

     <img src="image/pic1.jpg" alt="Product1" class="product-img">
    <h3>Nike Air Jordan 1</h3>
    <p class="store-name">Edu Thrift</p>
    <p class="price">₱9,000</p>
    <button type="button">Add to Cart</button>
    <button type="button">Buy Now</button>
</div>


    <div class="product">
    <div class="product-top">
        <span class="badge">New</span>
        <span class="icon">☆</span>
    </div>

        <img src="image/pic2.jpg" alt="Product2" class="product-img">
        <h3>Expandable Laptop Backpack</h3>
        <p class="store-name">Everyday Essential</p>
        <p>Price: ₱869</p>
        <button type="button">Add to Cart</button>
        <button type="button">Buy Now</button>
    </div>

    <div class="product">
    <div class="product-top">
        <span class="badge">Pre-loved</span>
        <span class="icon">☆</span>
    </div>

        <img src="image/pic3.jpg" alt="Product3" class="product-img">
        <h3>Slim Fit Long Sleeve Shirt</h3>
        <p class="store-name">Style Closet</p>
        <p>Price: ₱450</p>
        <button type="button">Add to Cart</button>
        <button type="button">Buy Now</button>
    </div>

    <div class="product">
    <div class="product-top">
        <span class="badge">Pre-loved</span>
        <span class="icon">☆</span>
    </div>

        <img src="image/pic4.jpg" alt="Product4" class="product-img">
        <h3>Wide-Leg Trousers</h3>
        <p class="store-name">Couture Finds</p>
        <p>Price: ₱550</p>
        <button type="button">Add to Cart</button>
        <button type="button">Buy Now</button>
    </div>

    <div class="product">
    <div class="product-top">
        <span class="badge">New</span>
        <span class="icon">☆</span>
    </div>

        <img src="image/pic5.jpg" alt="Product5" class="product-img">
        <h3>Rexel Lever File Organizer</h3>
        <p class="store-name">Study Hub</p>
        <p>Price: ₱180</p>
        <button type="button">Add to Cart</button>
        <button type="button">Buy Now</button>
    </div>

    <div class="product">
    <div class="product-top">
        <span class="badge">Pre-loved</span>
        <span class="icon">☆</span>
    </div>

        <img src="image/pic6.jpg" alt="Product6" class="product-img">
        <h3>Classic Leather Tote Bag</h3>
        <p class="store-name">Trendy Bags</p>
        <p>Price: ₱650</p>
        <button type="button">Add to Cart</button>
        <button type="button">Buy Now</button>
    </div>

    <div class="product">
    <div class="product-top">
        <span class="badge">Pre-loved</span>
        <span class="icon">☆</span>
    </div>

        <img src="image/pic7.jpg" alt="Product7" class="product-img">
        <h3>Apple Ipad Air</h3>
        <p class="store-name">Gadget Corner</p>
        <p>Price: ₱15,500</p>
        <button type="button">Add to Cart</button>
        <button type="button">Buy Now</button>
    </div>

    <div class="product">
    <div class="product-top">
        <span class="badge">New</span>
        <span class="icon">☆</span>
    </div>

        <img src="image/pic8.jpg" alt="Product8" class="product-img">
        <h3>Black Penny Loafers</h3>
        <p class="store-name">StepStyle Footwear</p>
        <p>Price: ₱899</p>
        <button type="button">Add to Cart</button>
        <button type="button">Buy Now</button>
    </div>


    <hr>

    <!-- How It Works (target of the "How It Works" button) -->
    <section id="Instructions" class="how-it-works">
        <h4>How it works</h4>
        <ol>
            <li>Find a good one</li>
            <p>Search by size, mood, or the seller you trust.</p>
            <li>Buy with confidence</li>
            <p>Every seller is reviewed.Every item is described honestly.</p>
            <li>Keep it moving</li>
            <p>When you're done, pass it on to someone new.</p>
        </ol>
    </section>

    <hr>

    <!-- Footer -->
    <footer>
        <p>© 2026 FYND Marketplace. All Rights Reserved.</p>
    </footer>

</body>
</html>
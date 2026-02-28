require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

/* =========================
   HELPER
========================= */
async function shopifyFetch(url) {
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const err = await response.text();
    console.log("Shopify API Error:", err);
    throw new Error("Shopify API failed");
  }

  return response.json();
}

/* =========================
   GET PRODUCTS
========================= */
app.get("/api/products", async (req, res) => {
  try {
    const data = await shopifyFetch(
      `https://${SHOP}/admin/api/2023-10/products.json?limit=50`
    );

    console.log("Products fetched:", data.products.length);

    res.json(data.products);
  } catch (err) {
    console.log("Product Fetch Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   MAIN UI
========================= */
app.get("/", (req, res) => {
  res.send(`
  <h1>ANAZIA GOLD</h1>

  <button onclick="showTab('pricing')">Pricing Panel</button>
  <button onclick="showTab('products')">Products</button>

  <div id="pricingTab">
    <h2>Pricing Panel</h2>
    Gold Rate ₹/gram:
    <input type="number" id="goldRate" value="7000"/>
  </div>

  <div id="productsTab" style="display:none">
    <h2>Products</h2>
    <div id="products">Loading...</div>
  </div>

  <script>
  function showTab(tab){
    document.getElementById("pricingTab").style.display =
      tab === "pricing" ? "block" : "none";

    document.getElementById("productsTab").style.display =
      tab === "products" ? "block" : "none";

    if(tab === "products"){
      loadProducts();
    }
  }

  async function loadProducts(){
    document.getElementById("products").innerHTML = "Loading products...";

    try{
      const res = await fetch('/api/products');
      const data = await res.json();

      if(!Array.isArray(data)){
        document.getElementById("products").innerHTML =
          "Error loading products";
        return;
      }

      let html = "";

      data.forEach(p => {
        html += \`
          <div style="padding:10px;border-bottom:1px solid #ccc">
            <b>\${p.title}</b><br>
            Status: \${p.status}
          </div>
        \`;
      });

      document.getElementById("products").innerHTML = html;

    } catch(err){
      document.getElementById("products").innerHTML =
        "API Error - check server logs";
    }
  }
  </script>
  `);
});

app.listen(PORT, () => {
  console.log("🚀 ANAZIA APP RUNNING");
});
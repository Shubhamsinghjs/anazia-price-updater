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
   GET ALL PRODUCTS
========================= */

app.get("/api/products", async (req, res) => {
  try {
    const response = await fetch(
      `https://${SHOP}/admin/api/2023-10/products.json?limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    res.json(data.products);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

/* =========================
   GET VARIANTS BY PRODUCT
========================= */

app.get("/api/product/:id", async (req, res) => {
  try {
    const productId = req.params.id;

    const response = await fetch(
      `https://${SHOP}/admin/api/2023-10/products/${productId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    res.json(data.product);

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

/* =========================
   BASIC ADMIN PAGE
========================= */

app.get("/", async (req, res) => {
  res.send(`
  <h1>ANAZIA GOLD – PRICING PANEL</h1>
  <button onclick="loadProducts()">Load Products</button>
  <div id="products"></div>
  <div id="variants"></div>

  <script>
    async function loadProducts(){
      const res = await fetch('/api/products');
      const data = await res.json();

      let html = "<h3>Select Product</h3>";

      data.forEach(p => {
        html += \`
          <div style="cursor:pointer;color:blue;margin:5px"
               onclick="loadVariants(\${p.id})">
            \${p.title}
          </div>
        \`;
      });

      document.getElementById("products").innerHTML = html;
    }

    async function loadVariants(id){
      const res = await fetch('/api/product/' + id);
      const data = await res.json();

      let html = "<h3>Variants</h3>";

      data.variants.forEach(v => {
        html += \`
          <div style="margin:10px;padding:10px;border:1px solid #ccc">
            <b>\${v.title}</b><br>
            Current Price: ₹\${v.price}
          </div>
        \`;
      });

      document.getElementById("variants").innerHTML = html;
    }
  </script>
  `);
});

app.listen(PORT, () => {
  console.log("🚀 ANAZIA PRICING PANEL RUNNING");
});
require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

let GLOBAL_GOLD_RATE = 0;

/* ===============================
   MAIN UI
================================ */
app.get("/", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>ANAZIA GOLD</title>
    <style>
      body { font-family: Arial; background:#f4f6f9; padding:20px; }
      h1 { margin-bottom:20px; }
      .tabs button {
        padding:10px 20px;
        margin-right:10px;
        border:none;
        background:#111;
        color:#fff;
        cursor:pointer;
        border-radius:5px;
      }
      .section { display:none; margin-top:20px; }
      .active { display:block; }

      .card {
        background:#fff;
        padding:15px;
        border-radius:8px;
        box-shadow:0 2px 8px rgba(0,0,0,0.08);
        margin-bottom:15px;
      }

      .variant {
        background:#fafafa;
        padding:10px;
        margin-top:10px;
        border-radius:6px;
      }

      input {
        padding:6px;
        margin:5px 5px 5px 0;
        border:1px solid #ccc;
        border-radius:4px;
        width:120px;
      }

      button.action {
        padding:6px 12px;
        border:none;
        background:#007bff;
        color:#fff;
        border-radius:4px;
        cursor:pointer;
      }

      .pagination button {
        margin:5px;
        padding:6px 12px;
        border:none;
        background:#333;
        color:#fff;
        border-radius:4px;
        cursor:pointer;
      }

    </style>
  </head>
  <body>

  <h1>ANAZIA GOLD – PRICING PANEL</h1>

  <div class="tabs">
    <button onclick="showTab('pricing')">Pricing Panel</button>
    <button onclick="showTab('products')">Products</button>
  </div>

  <div id="pricing" class="section active">
    <div class="card">
      <h3>Gold Pricing Panel</h3>
      Gold Rate ₹/gram:
      <input id="goldRate" placeholder="Enter gold rate">
      <button class="action" onclick="saveGold()">Save</button>
      <p id="goldSaved"></p>
    </div>
  </div>

  <div id="products" class="section">
    <div id="productContainer">Loading...</div>
    <div id="pagination" class="pagination"></div>
  </div>

<script>

let currentPage = 1;

function showTab(id) {
  document.getElementById("pricing").classList.remove("active");
  document.getElementById("products").classList.remove("active");
  document.getElementById(id).classList.add("active");
}

async function saveGold() {
  const rate = document.getElementById("goldRate").value;
  await fetch('/api/set-gold', {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ rate })
  });
  document.getElementById("goldSaved").innerText = "Saved!";
}

async function loadProducts(page = 1) {
  currentPage = page;
  const res = await fetch('/api/products?page=' + page);
  const data = await res.json();

  let html = "";
  data.products.forEach(p => {
    html += \`
      <div class="card">
        <b>\${p.title}</b>
        <button class="action" onclick="loadVariants(\${p.id})">Configure</button>
        <div id="variants-\${p.id}"></div>
      </div>
    \`;
  });

  document.getElementById("productContainer").innerHTML = html;

  // Pagination
  let pagHTML = "";
  if (data.currentPage > 1) {
    pagHTML += \`<button onclick="loadProducts(\${data.currentPage - 1})">Prev</button>\`;
  }
  if (data.currentPage < data.totalPages) {
    pagHTML += \`<button onclick="loadProducts(\${data.currentPage + 1})">Next</button>\`;
  }
  document.getElementById("pagination").innerHTML = pagHTML;
}

async function loadVariants(productId) {
  const res = await fetch('/api/variants/' + productId);
  const variants = await res.json();

  let html = "";
  variants.forEach(v => {
    html += \`
      <div class="variant">
        <b>\${v.title}</b><br>
        Base: ₹\${v.price}<br><br>

        Gold Weight <input id="weight-\${v.id}" placeholder="Weight">
        Diamond <input id="diamond-\${v.id}" placeholder="Diamond">
        Making <input id="making-\${v.id}" placeholder="Making">
        GST % <input id="gst-\${v.id}" placeholder="GST">

        <button class="action" onclick="updatePrice(\${v.id}, \${v.price})">
          Update Price
        </button>
      </div>
    \`;
  });

  document.getElementById("variants-" + productId).innerHTML = html;
}

async function updatePrice(id, basePrice) {
  const weight = parseFloat(document.getElementById("weight-" + id).value) || 0;
  const diamond = parseFloat(document.getElementById("diamond-" + id).value) || 0;
  const making = parseFloat(document.getElementById("making-" + id).value) || 0;
  const gst = parseFloat(document.getElementById("gst-" + id).value) || 0;

  const res = await fetch('/api/update', {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ id, basePrice, weight, diamond, making, gst })
  });

  const data = await res.json();
  alert("Updated ₹" + data.final);
}

loadProducts();

</script>
  </body>
  </html>
  `);
});

/* ===============================
   SET GOLD RATE
================================ */
app.post("/api/set-gold", (req, res) => {
  GLOBAL_GOLD_RATE = parseFloat(req.body.rate) || 0;
  res.json({ success:true });
});

/* ===============================
   GET PRODUCTS (500 Max)
================================ */
app.get("/api/products", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;

    const r = await fetch(
      \`https://${SHOP}/admin/api/2023-10/products.json?limit=250\`,
      { headers:{ "X-Shopify-Access-Token": TOKEN } }
    );

    const data = await r.json();
    const allProducts = data.products || [];

    const start = (page - 1) * limit;
    const end = start + limit;

    res.json({
      products: allProducts.slice(start, end),
      currentPage: page,
      totalPages: Math.ceil(allProducts.length / limit)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error:"Failed to load products" });
  }
});

/* ===============================
   GET VARIANTS
================================ */
app.get("/api/variants/:id", async (req, res) => {
  const r = await fetch(
    \`https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json\`,
    { headers:{ "X-Shopify-Access-Token": TOKEN } }
  );

  const data = await r.json();
  res.json(data.product.variants);
});

/* ===============================
   UPDATE PRICE
================================ */
app.post("/api/update", async (req, res) => {
  const { id, basePrice, weight, diamond, making, gst } = req.body;

  const metalCost = GLOBAL_GOLD_RATE * weight;
  const subtotal = parseFloat(basePrice) + metalCost + diamond + making;
  const final = subtotal + (subtotal * gst / 100);

  await fetch(
    \`https://${SHOP}/admin/api/2023-10/variants/${id}.json\`,
    {
      method:"PUT",
      headers:{
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        variant:{ id, price: final.toFixed(2) }
      })
    }
  );

  res.json({ final: final.toFixed(2) });
});

app.listen(PORT, () => {
  console.log("🚀 ANAZIA GOLD ENGINE RUNNING");
});
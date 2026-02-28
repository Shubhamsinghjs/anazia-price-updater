require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

async function shopifyFetch(url, method = "GET", body = null) {
  return fetch(url, {
    method,
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
  });
}

/* ================= API ================= */

app.get("/api/products", async (req, res) => {
  const response = await shopifyFetch(
    `https://${SHOP}/admin/api/2023-10/products.json?limit=250`
  );
  const data = await response.json();
  res.json(data.products);
});

app.get("/api/product/:id", async (req, res) => {
  const response = await shopifyFetch(
    `https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json`
  );
  const data = await response.json();
  res.json(data.product);
});

/* ================= UI ================= */

app.get("/", (req, res) => {
  res.send(`
  <h1>ANAZIA GOLD</h1>

  <div style="margin-bottom:20px;">
    <button onclick="showTab('pricing')">Pricing Panel</button>
    <button onclick="showTab('products')">Products</button>
  </div>

  <div id="pricingTab">
    <h2>Pricing Panel</h2>
    Gold Rate ₹/gram:
    <input type="number" id="goldRate" value="7000"/>
  </div>

  <div id="productsTab" style="display:none">
    <h2>Products</h2>
    <div id="products"></div>
    <div id="variants"></div>
    <div id="formArea"></div>
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
    const res = await fetch('/api/products');
    const data = await res.json();

    let html = "";

    data.forEach(p => {
      html += \`
        <div style="padding:10px;border-bottom:1px solid #ccc;cursor:pointer"
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
        <div style="margin:5px;color:green;cursor:pointer"
             onclick="openForm(\${v.id}, '\${v.title}')">
          \${v.title} - ₹\${v.price}
        </div>
      \`;
    });

    document.getElementById("variants").innerHTML = html;
  }

  function openForm(variantId, title){
    document.getElementById("formArea").innerHTML = \`
      <h3>Configure: \${title}</h3>

      Metal Weight (grams):
      <input type="number" id="weight"/><br><br>

      Diamond Price:
      <input type="number" id="diamond"/><br><br>

      Making %:
      <input type="number" id="making"/><br><br>

      GST %:
      <input type="number" id="gst"/><br><br>

      <button onclick="updatePrice(\${variantId})">
        Calculate & Update
      </button>
    \`;
  }

  async function updatePrice(variantId){
    const goldRate = parseFloat(document.getElementById("goldRate").value);
    const weight = parseFloat(document.getElementById("weight").value);
    const diamond = parseFloat(document.getElementById("diamond").value);
    const making = parseFloat(document.getElementById("making").value);
    const gst = parseFloat(document.getElementById("gst").value);

    const goldValue = goldRate * weight;
    const makingValue = goldValue * (making/100);
    const subtotal = goldValue + diamond + makingValue;
    const gstValue = subtotal * (gst/100);
    const finalPrice = subtotal + gstValue;

    await fetch('/api/update-price', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId,
        goldRate,
        weight,
        diamond,
        making,
        gst
      })
    });

    alert("Updated: ₹" + finalPrice.toFixed(2));
  }

  </script>
  `);
});

/* ================= PRICE UPDATE API ================= */

app.post("/api/update-price", async (req, res) => {
  const { variantId, goldRate, weight, diamond, making, gst } = req.body;

  const goldValue = goldRate * weight;
  const makingValue = goldValue * (making / 100);
  const subtotal = goldValue + parseFloat(diamond) + makingValue;
  const gstValue = subtotal * (gst / 100);
  const finalPrice = subtotal + gstValue;

  await shopifyFetch(
    `https://${SHOP}/admin/api/2023-10/variants/${variantId}.json`,
    "PUT",
    {
      variant: {
        id: variantId,
        price: finalPrice.toFixed(2),
      },
    }
  );

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log("🚀 ANAZIA PRICING PANEL READY");
});
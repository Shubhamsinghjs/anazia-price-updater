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
   GET PRODUCTS
========================= */
app.get("/api/products", async (req, res) => {
  const response = await fetch(
    `https://${SHOP}/admin/api/2023-10/products.json?limit=250`,
    { headers: { "X-Shopify-Access-Token": TOKEN } }
  );
  const data = await response.json();
  res.json(data.products);
});

/* =========================
   GET PRODUCT + VARIANTS
========================= */
app.get("/api/product/:id", async (req, res) => {
  const response = await fetch(
    `https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json`,
    { headers: { "X-Shopify-Access-Token": TOKEN } }
  );
  const data = await response.json();
  res.json(data.product);
});

/* =========================
   UPDATE VARIANT PRICE
========================= */
app.post("/api/update-price", async (req, res) => {
  const { variantId, goldRate, weight, diamond, making, gst } = req.body;

  const goldValue = goldRate * weight;
  const makingValue = goldValue * (making / 100);
  const subtotal = goldValue + parseFloat(diamond) + makingValue;
  const gstValue = subtotal * (gst / 100);
  const finalPrice = subtotal + gstValue;

  await fetch(
    `https://${SHOP}/admin/api/2023-10/variants/${variantId}.json`,
    {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        variant: {
          id: variantId,
          price: finalPrice.toFixed(2),
        },
      }),
    }
  );

  res.json({ success: true, finalPrice });
});

/* =========================
   ADMIN UI
========================= */
app.get("/", (req, res) => {
  res.send(`
  <h1>ANAZIA GOLD – PRICING PANEL</h1>
  Gold Rate ₹/gram:
  <input type="number" id="goldRate" /><br><br>
  <button onclick="loadProducts()">Load Products</button>
  <div id="products"></div>
  <div id="variants"></div>
  <div id="formArea"></div>

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
        <div style="cursor:pointer;margin:5px;color:green"
             onclick="openForm(\${v.id}, '\${v.title}')">
          \${v.title} - ₹\${v.price}
        </div>
      \`;
    });

    document.getElementById("variants").innerHTML = html;
  }

  function openForm(variantId, title){
    document.getElementById("formArea").innerHTML = \`
      <h3>Configure Variant: \${title}</h3>

      Metal Weight (grams):
      <input type="number" id="weight" /><br><br>

      Diamond Price:
      <input type="number" id="diamond" /><br><br>

      Making %:
      <input type="number" id="making" /><br><br>

      GST %:
      <input type="number" id="gst" /><br><br>

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

    const res = await fetch('/api/update-price', {
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

    const data = await res.json();
    alert("Updated! Final Price: ₹" + data.finalPrice);
  }

  </script>
  `);
});

app.listen(PORT, () => {
  console.log("🚀 ANAZIA PRICING PANEL READY");
});
require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

if (!SHOP || !TOKEN) {
  console.log("Missing .env values");
  process.exit(1);
}

/* ===============================
   MAIN UI
================================ */
app.get("/", (req, res) => {
  res.send(`
    <h1>ANAZIA GOLD – PRICING PANEL</h1>
    <button onclick="loadProducts()">Load Products</button>
    <div id="products"></div>

<script>
async function loadProducts() {
  const res = await fetch('/api/products');
  const products = await res.json();

  let html = "<h2>Products</h2>";
  products.forEach(p => {
    html += \`
      <div style="margin-bottom:10px">
        <button onclick="loadVariants(\${p.id})">\${p.title}</button>
        <div id="variants-\${p.id}"></div>
      </div>
    \`;
  });

  document.getElementById("products").innerHTML = html;
}

async function loadVariants(productId) {
  const res = await fetch('/api/variants/' + productId);
  const variants = await res.json();

  let html = "<h3>Variants</h3>";

  variants.forEach(v => {
    html += \`
      <div style="border:1px solid #ccc;padding:10px;margin:5px">
        <b>\${v.title}</b><br>
        Base Price: ₹\${v.price}<br><br>

        Gold Rate: <input id="gold-\${v.id}" placeholder="Gold Rate"><br>
        Gold Weight: <input id="weight-\${v.id}" placeholder="Weight"><br>
        Diamond Price: <input id="diamond-\${v.id}" placeholder="Diamond"><br>
        Making Charges: <input id="making-\${v.id}" placeholder="Making"><br>
        GST %: <input id="gst-\${v.id}" placeholder="GST"><br><br>

        <button onclick="updatePrice(\${v.id}, \${v.price})">Update Price</button>
      </div>
    \`;
  });

  document.getElementById("variants-" + productId).innerHTML = html;
}

async function updatePrice(id, basePrice) {
  const gold = parseFloat(document.getElementById("gold-" + id).value) || 0;
  const weight = parseFloat(document.getElementById("weight-" + id).value) || 0;
  const diamond = parseFloat(document.getElementById("diamond-" + id).value) || 0;
  const making = parseFloat(document.getElementById("making-" + id).value) || 0;
  const gst = parseFloat(document.getElementById("gst-" + id).value) || 0;

  const res = await fetch('/api/update-price', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, basePrice, gold, weight, diamond, making, gst })
  });

  const data = await res.json();
  alert("Updated: ₹" + data.finalPrice);
}
</script>
  `);
});

/* ===============================
   FETCH PRODUCTS
================================ */
app.get("/api/products", async (req, res) => {
  try {
    const response = await fetch(
      `https://${SHOP}/admin/api/2023-10/products.json?limit=50`,
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
    res.status(500).json({ error: "Product fetch failed" });
  }
});

/* ===============================
   FETCH VARIANTS
================================ */
app.get("/api/variants/:productId", async (req, res) => {
  try {
    const response = await fetch(
      `https://${SHOP}/admin/api/2023-10/products/${req.params.productId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    res.json(data.product.variants);
  } catch (err) {
    res.status(500).json({ error: "Variant fetch failed" });
  }
});

/* ===============================
   UPDATE PRICE
================================ */
app.post("/api/update-price", async (req, res) => {
  try {
    const { id, basePrice, gold, weight, diamond, making, gst } = req.body;

    const metalCost = gold * weight;
    const subtotal = parseFloat(basePrice) + metalCost + diamond + making;
    const finalPrice = subtotal + (subtotal * gst / 100);

    await fetch(
      `https://${SHOP}/admin/api/2023-10/variants/${id}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          variant: {
            id,
            price: finalPrice.toFixed(2),
          },
        }),
      }
    );

    res.json({ finalPrice: finalPrice.toFixed(2) });

  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.listen(PORT, () => {
  console.log("🚀 ANAZIA GOLD ENGINE RUNNING");
});
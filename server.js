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
   MAIN ADMIN UI
================================ */
app.get("/", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>ANAZIA GOLD MASTER</title>
    <style>
      body {
        font-family: Arial;
        background: #f4f6f9;
        padding: 30px;
      }
      h1 { margin-bottom: 20px; }

      .card {
        background: white;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.08);
        margin-bottom: 20px;
      }

      input {
        padding: 8px;
        margin: 5px;
        width: 130px;
        border-radius: 6px;
        border: 1px solid #ccc;
      }

      button {
        padding: 8px 14px;
        border: none;
        border-radius: 6px;
        background: #111;
        color: white;
        cursor: pointer;
      }

      button:hover {
        opacity: 0.85;
      }
    </style>
  </head>

  <body>

  <h1>ANAZIA GOLD – MASTER PANEL</h1>

  <div class="card">
    <h3>Update Gold Rate (Whole Website)</h3>
    <input id="goldRate" placeholder="Gold Rate ₹/gram">
    <button onclick="updateGold()">Update All Prices</button>
    <p id="status"></p>
  </div>

  <div class="card">
    <h3>Save Variant Configuration (One Time Setup)</h3>
    Variant ID <input id="vid">
    Weight <input id="weight">
    Diamond <input id="diamond">
    Making <input id="making">
    GST % <input id="gst">
    <button onclick="saveVariant()">Save Config</button>
  </div>

<script>

async function updateGold(){
  const rate = document.getElementById("goldRate").value;

  document.getElementById("status").innerText = "Updating entire website...";

  const res = await fetch('/api/set-gold',{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ rate })
  });

  const data = await res.json();

  document.getElementById("status").innerText =
    "Updated Variants: " + data.updated;
}

async function saveVariant(){
  const id = document.getElementById("vid").value;
  const weight = document.getElementById("weight").value;
  const diamond = document.getElementById("diamond").value;
  const making = document.getElementById("making").value;
  const gst = document.getElementById("gst").value;

  await fetch('/api/save-variant',{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ id, weight, diamond, making, gst })
  });

  alert("Variant configuration saved!");
}

</script>

  </body>
  </html>
  `);
});

/* ===============================
   SAVE VARIANT CONFIG TO METAFIELD
================================ */
app.post("/api/save-variant", async (req, res) => {

  try {

    const { id, weight, diamond, making, gst } = req.body;

    await fetch(
      `https://${SHOP}/admin/api/2023-10/variants/${id}/metafields.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          metafield: {
            namespace: "custom",
            key: "gold_config",
            type: "json",
            value: JSON.stringify({
              weight,
              diamond,
              making,
              gst
            })
          }
        })
      }
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Save Config Error:", err);
    res.status(500).json({ error: "Failed to save variant config" });
  }

});

/* ===============================
   UPDATE WHOLE WEBSITE ON GOLD CHANGE
================================ */
app.post("/api/set-gold", async (req, res) => {

  try {

    GLOBAL_GOLD_RATE = parseFloat(req.body.rate) || 0;

    let updated = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {

      const r = await fetch(
        `https://${SHOP}/admin/api/2023-10/products.json?limit=250&page=${page}`,
        {
          headers: {
            "X-Shopify-Access-Token": TOKEN
          }
        }
      );

      const data = await r.json();
      const products = data.products || [];

      if (products.length === 0) {
        hasMore = false;
        break;
      }

      for (const product of products) {

        for (const variant of product.variants) {

          const metaRes = await fetch(
            `https://${SHOP}/admin/api/2023-10/variants/${variant.id}/metafields.json`,
            {
              headers: {
                "X-Shopify-Access-Token": TOKEN
              }
            }
          );

          const metaData = await metaRes.json();

          const config = metaData.metafields.find(
            m => m.key === "gold_config"
          );

          if (config) {

            const parsed = JSON.parse(config.value);

            const weight = parseFloat(parsed.weight || 0);
            const diamond = parseFloat(parsed.diamond || 0);
            const making = parseFloat(parsed.making || 0);
            const gst = parseFloat(parsed.gst || 0);

            const goldTotal = GLOBAL_GOLD_RATE * weight;
            const subtotal = goldTotal + diamond + making;
            const gstAmount = subtotal * (gst / 100);
            const final = subtotal + gstAmount;

            await fetch(
              `https://${SHOP}/admin/api/2023-10/variants/${variant.id}.json`,
              {
                method: "PUT",
                headers: {
                  "X-Shopify-Access-Token": TOKEN,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  variant: {
                    id: variant.id,
                    price: final.toFixed(2)
                  }
                })
              }
            );

            updated++;
          }

        }

      }

      page++;

    }

    res.json({ updated });

  } catch (err) {
    console.error("Bulk Update Error:", err);
    res.status(500).json({ error: "Bulk update failed" });
  }

});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log("ANAZIA GOLD MASTER SYSTEM RUNNING");
});
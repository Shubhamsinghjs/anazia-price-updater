require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

/* ---------------- VALIDATION ---------------- */

if (!SHOP || !TOKEN) {
  console.log("❌ Missing SHOPIFY_STORE or SHOPIFY_ACCESS_TOKEN in .env");
  process.exit(1);
}

/* ---------------- PANEL ---------------- */

app.get("/", (req, res) => {
  res.send(`
    <h2>Gold Price Updater</h2>
    <form method="POST" action="/update">
      <input name="gold" placeholder="Enter Gold Rate ₹/gram" required />
      <button>Update Prices</button>
    </form>
  `);
});

/* ---------------- PRICE UPDATE ---------------- */

app.post("/update", async (req, res) => {
  try {
    const goldRate = parseFloat(req.body.gold);

    if (!goldRate || goldRate <= 0) {
      return res.send("❌ Invalid gold rate");
    }

    console.log("💰 Gold Price Entered:", goldRate);

    /* -------- FETCH PRODUCTS -------- */

    const response = await fetch(
      `https://${SHOP}/admin/api/2023-10/products.json?limit=250`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log("❌ Shopify API Error:", errorText);
      return res.send("❌ Error fetching products (API rejected request)");
    }

    const data = await response.json();

    if (!Array.isArray(data.products)) {
      console.log("❌ Invalid Products Response:", data);
      return res.send("❌ Error fetching products");
    }

    const products = data.products;

    if (products.length === 0) {
      return res.send("⚠ No products found");
    }

    console.log(`📦 Total Products Fetched: ${products.length}`);

    /* -------- UPDATE VARIANTS -------- */

    let updatedCount = 0;

    for (const product of products) {
      if (!Array.isArray(product.variants)) continue;

      for (const variant of product.variants) {
        const updateResponse = await fetch(
          `https://${SHOP}/admin/api/2023-10/variants/${variant.id}.json`,
          {
            method: "PUT",
            headers: {
              "X-Shopify-Access-Token": TOKEN,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              variant: {
                id: variant.id,
                price: goldRate,
              },
            }),
          }
        );

        if (!updateResponse.ok) {
          const errText = await updateResponse.text();
          console.log(`❌ Failed Variant ${variant.id}:`, errText);
          continue;
        }

        updatedCount++;
        console.log(`✅ Updated Variant ${variant.id}`);
      }
    }

    console.log(`🎯 Total Variants Updated: ${updatedCount}`);

    res.send(`✅ Successfully Updated ${updatedCount} Variants`);
  } catch (err) {
    console.log("🔥 SERVER ERROR:", err);
    res.send("❌ Error updating prices");
  }
});

/* ---------------- SERVER ---------------- */

app.listen(PORT, () => {
  console.log("🚀 ANAZIA GOLD SERVER RUNNING on port", PORT);
});
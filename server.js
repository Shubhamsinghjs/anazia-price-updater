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

    console.log("💰 Gold Rate:", goldRate);

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

    if (!Array.isArray(data.products)) {
      return res.send("❌ Error fetching products");
    }

    let updatedCount = 0;

    for (const product of data.products) {

      /* ----- Fetch All Metafields ----- */

      const metafieldRes = await fetch(
        `https://${SHOP}/admin/api/2023-10/products/${product.id}/metafields.json`,
        {
          headers: {
            "X-Shopify-Access-Token": TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      const metafieldData = await metafieldRes.json();

      const goldWeightField = metafieldData.metafields?.find(
        m =>
          m.namespace.toLowerCase() === "custom" &&
          m.key.toLowerCase() === "gold_weight"
      );

      const basePriceField = metafieldData.metafields?.find(
        m =>
          m.namespace.toLowerCase() === "custom" &&
          m.key.toLowerCase() === "base_price"
      );

      const goldWeight = goldWeightField
        ? parseFloat(goldWeightField.value)
        : 0;

      const basePrice = basePriceField
        ? parseFloat(basePriceField.value)
        : 0;

      if (!goldWeight || !basePrice) {
        console.log(`⚠ Missing metafield for product ${product.id}`);
        continue;
      }

      const finalPrice = basePrice + (goldRate * goldWeight);

      if (!Array.isArray(product.variants)) continue;

      for (const variant of product.variants) {

        const updateRes = await fetch(
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
                price: finalPrice.toFixed(2),
              },
            }),
          }
        );

        if (!updateRes.ok) {
          const err = await updateRes.text();
          console.log(`❌ Failed Variant ${variant.id}`, err);
          continue;
        }

        updatedCount++;
        console.log(
          `✅ Variant ${variant.id} | Weight: ${goldWeight} | Base: ${basePrice} | Final: ${finalPrice}`
        );

        /* Rate limit protection */
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }

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
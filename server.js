require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

if (!SHOP || !TOKEN) {
  console.log("❌ Missing SHOPIFY_STORE or SHOPIFY_ACCESS_TOKEN in .env");
  process.exit(1);
}

app.get("/", (req, res) => {
  res.send(`
    <h2>ANAZIA GOLD FINAL</h2>
    <form method="POST" action="/update">
      <input name="gold" placeholder="Enter Gold Rate ₹/gram" required />
      <button>Update Prices</button>
    </form>
  `);
});

app.post("/update", async (req, res) => {
  try {
    const goldRate = parseFloat(req.body.gold);
    if (!goldRate || goldRate <= 0) {
      return res.send("❌ Invalid gold rate");
    }

    console.log("💰 Gold Rate:", goldRate);

    let pageInfo = null;
    let updatedCount = 0;
    let totalProducts = 0;

    do {
      const url = pageInfo
        ? `https://${SHOP}/admin/api/2023-10/products.json?limit=250&page_info=${pageInfo}`
        : `https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

      const response = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      const products = data.products || [];
      totalProducts += products.length;

      const linkHeader = response.headers.get("link");
      pageInfo = null;

      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^&>]+)/);
        if (match) pageInfo = match[1];
      }

      for (const product of products) {

        if (!Array.isArray(product.variants)) continue;

        for (const variant of product.variants) {

          /* 🔹 Get Variant Metafield (gold_weight) */
          const metafieldRes = await fetch(
            `https://${SHOP}/admin/api/2023-10/variants/${variant.id}/metafields.json`,
            {
              headers: {
                "X-Shopify-Access-Token": TOKEN,
                "Content-Type": "application/json",
              },
            }
          );

          const metafieldData = await metafieldRes.json();

          const weightField = metafieldData.metafields?.find(
            m => m.namespace === "custom" && m.key === "gold_weight"
          );

          const goldWeight = weightField
            ? parseFloat(weightField.value)
            : 0;

          if (!goldWeight) {
            console.log(`⚠ No weight for Variant ${variant.id}`);
            continue;
          }

          /* 🔹 Base price = existing variant price ONLY */
          const basePrice = parseFloat(variant.price) || 0;

          if (!basePrice) continue;

          /* 🔹 Final calculation */
          const finalPrice = basePrice + (goldRate * goldWeight);

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
                  price: finalPrice.toFixed(2)
                },
              }),
            }
          );

          if (!updateRes.ok) {
            const err = await updateRes.text();
            console.log("❌ Update Failed:", err);
            continue;
          }

          updatedCount++;

          console.log(
            `✅ Variant ${variant.id} | Weight: ${goldWeight} | Base: ${basePrice} | Final: ${finalPrice}`
          );

          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }

    } while (pageInfo);

    res.send(`
      ✅ Gold Rate: ${goldRate} <br>
      📦 Total Products Checked: ${totalProducts} <br>
      🔄 Variants Updated: ${updatedCount}
    `);

  } catch (err) {
    console.log("🔥 SERVER ERROR:", err);
    res.send("❌ Error updating prices");
  }
});

app.listen(PORT, () => {
  console.log("🚀 ANAZIA GOLD FINAL SERVER RUNNING on port", PORT);
});
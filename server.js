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
  console.log("❌ Missing ENV variables");
  process.exit(1);
}

app.get("/", (req, res) => {
  res.send(`
    <h2>ANAZIA GOLD FINAL LOGIC</h2>
    <form method="POST" action="/update">
      <input name="gold" placeholder="Enter Gold Rate ₹/gram" required />
      <button>Update Prices</button>
    </form>
  `);
});

app.post("/update", async (req, res) => {
  try {
    const goldRate = parseFloat(req.body.gold);
    if (!goldRate || goldRate <= 0)
      return res.send("❌ Invalid gold rate");

    console.log("💰 Gold Rate:", goldRate);

    let pageInfo = null;
    let updatedCount = 0;

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

      const linkHeader = response.headers.get("link");
      pageInfo = null;

      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^&>]+)/);
        if (match) pageInfo = match[1];
      }

      for (const product of products) {

        /* 🔹 PRODUCT LEVEL GOLD WEIGHT */
        const metaRes = await fetch(
          `https://${SHOP}/admin/api/2023-10/products/${product.id}/metafields.json`,
          {
            headers: {
              "X-Shopify-Access-Token": TOKEN,
              "Content-Type": "application/json",
            },
          }
        );

        const metaData = await metaRes.json();

        const weightField = metaData.metafields?.find(
          m => m.namespace === "custom" && m.key === "gold_weight"
        );

        const goldWeight = weightField
          ? parseFloat(weightField.value)
          : 0;

        if (!goldWeight) continue;

        for (const variant of product.variants) {

          /* 🔹 Lock Base Price */
          let basePrice = parseFloat(variant.compare_at_price);

          if (!basePrice) {
            basePrice = parseFloat(variant.price);

            // store base price permanently
            await fetch(
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
                    compare_at_price: basePrice.toFixed(2),
                  },
                }),
              }
            );
          }

          /* 🔹 FINAL FORMULA */
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
                  price: finalPrice.toFixed(2),
                },
              }),
            }
          );

          if (!updateRes.ok) {
            const err = await updateRes.text();
            console.log("❌ Failed:", err);
            continue;
          }

          updatedCount++;

          console.log(
            `✅ Variant ${variant.id} | Base: ${basePrice} | Weight: ${goldWeight} | Final: ${finalPrice}`
          );

          await new Promise(r => setTimeout(r, 350));
        }
      }

    } while (pageInfo);

    res.send(`✅ Successfully Updated ${updatedCount} Variants`);

  } catch (err) {
    console.log("🔥 ERROR:", err);
    res.send("❌ Update failed");
  }
});

app.listen(PORT, () => {
  console.log("🚀 ANAZIA GOLD SERVER RUNNING");
});
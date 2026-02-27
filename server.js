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
  console.log("❌ Missing ENV");
  process.exit(1);
}

app.get("/", (req, res) => {
  res.send(`
    <h2>ANAZIA GOLD – MANUAL MODE</h2>
    <form method="POST" action="/update">
      <input name="gold" placeholder="Gold Rate ₹/gram" required />
      <button>RUN UPDATE</button>
    </form>
    <p>⚠ Runs ONLY when you click button</p>
  `);
});

app.post("/update", async (req, res) => {
  try {
    const goldRate = parseFloat(req.body.gold);
    if (!goldRate || goldRate <= 0)
      return res.send("❌ Invalid gold rate");

    let pageInfo = null;
    let updated = 0;

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

      const link = response.headers.get("link");
      pageInfo = link?.includes('rel="next"')
        ? link.match(/page_info=([^&>]+)/)?.[1]
        : null;

      for (const product of products) {

        // 🔹 PRODUCT GOLD WEIGHT
        const metaRes = await fetch(
          `https://${SHOP}/admin/api/2023-10/products/${product.id}/metafields.json`,
          {
            headers: {
              "X-Shopify-Access-Token": TOKEN,
              "Content-Type": "application/json",
            },
          }
        );

        const meta = await metaRes.json();
        const weightField = meta.metafields?.find(
          m => m.namespace === "custom" && m.key === "gold_weight"
        );

        const goldWeight = weightField ? parseFloat(weightField.value) : 0;
        if (!goldWeight) continue;

        for (const variant of product.variants) {

          // 🔒 BASE PRICE LOCK
          let basePrice = parseFloat(variant.compare_at_price);

          if (!basePrice) {
            basePrice = parseFloat(variant.price);

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

          const finalPrice =
            basePrice + (goldRate * goldWeight);

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
                  price: finalPrice.toFixed(2),
                },
              }),
            }
          );

          console.log(
            `✅ Variant ${variant.id} | Base ${basePrice} | Weight ${goldWeight} | Final ${finalPrice}`
          );

          updated++;
          await new Promise(r => setTimeout(r, 300));
        }
      }

    } while (pageInfo);

    res.send(`✅ DONE. Updated ${updated} variants`);

  } catch (e) {
    console.log(e);
    res.send("❌ Error");
  }
});

app.listen(PORT, () => {
  console.log("🚀 ANAZIA GOLD MANUAL SERVER RUNNING");
});
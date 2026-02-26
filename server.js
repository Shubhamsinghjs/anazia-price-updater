require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
    const goldRate = Number(req.body.gold);

    const SHOP = process.env.SHOP;
    const TOKEN = process.env.SHOPIFY_TOKEN;

    const productsRes = await fetch(
      `https://${SHOP}/admin/api/2023-10/products.json?limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
        },
      }
    );

    const productsData = await productsRes.json();
    const products = productsData.products;

    for (const product of products) {
      const metafieldsRes = await fetch(
        `https://${SHOP}/admin/api/2023-10/products/${product.id}/metafields.json`,
        {
          headers: {
            "X-Shopify-Access-Token": TOKEN,
          },
        }
      );

      const metafieldsData = await metafieldsRes.json();

      let goldWeight = 0;

      metafieldsData.metafields.forEach((m) => {
        if (m.key === "gold_weight") {
          goldWeight = Number(m.value);
        }
      });

      if (!goldWeight) continue;

      const finalPrice = (goldWeight * goldRate).toFixed(2);

      for (const variant of product.variants) {
        await fetch(
          `https://${SHOP}/admin/api/2023-10/variants/${variant.id}.json`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": TOKEN,
            },
            body: JSON.stringify({
              variant: {
                id: variant.id,
                price: finalPrice,
              },
            }),
          }
        );
      }
    }

    res.send("✅ Gold Prices Updated Successfully");
  } catch (err) {
    console.log(err);
    res.send("Error updating prices");
  }
});

/* ---------------- SERVER ---------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("ANAZIA GOLD SERVER RUNNING");
});
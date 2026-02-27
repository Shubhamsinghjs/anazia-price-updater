require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

/* -------- PANEL -------- */

app.get("/", (req, res) => {
  res.send(`
    <h2>Gold Price Updater</h2>
    <form method="POST" action="/update">
      <input name="gold" placeholder="Enter Gold Rate ₹/gram" required />
      <button>Update Prices</button>
    </form>
  `);
});

/* -------- PRICE UPDATE -------- */

app.post("/update", async (req, res) => {
  try {
    const goldRate = parseFloat(req.body.gold);
    if (!goldRate) return res.send("Invalid gold rate");

    console.log("Gold Price Entered:", goldRate);

    // Fetch Products
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

    const data = await response.json();
    console.log("SHOPIFY RESPONSE:", data);

    if (!data.products) {
      console.log("No products found or API error");
      return res.send("Error fetching products");
    }

    const products = data.products;

    for (let product of products) {
      for (let variant of product.variants) {
        const newPrice = goldRate; // simple demo logic

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
                price: newPrice,
              },
            }),
          }
        );

        console.log(`Updated Variant ${variant.id} → ${newPrice}`);
      }
    }

    res.send("Prices updated successfully ✅");
  } catch (err) {
    console.log("ERROR:", err);
    res.send("Error updating prices");
  }
});

/* -------- SERVER -------- */

app.listen(PORT, () => {
  console.log("ANAZIA GOLD SERVER RUNNING on port", PORT);
});
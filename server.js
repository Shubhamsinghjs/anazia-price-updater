require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHOP = process.env.SHOP;
const TOKEN = process.env.SHOPIFY_TOKEN;
const PORT = process.env.PORT || 3000;

/* ===============================
   ROOT
================================ */
app.get("/", (req, res) => {
  res.send("ANAZIA Price Updater Running 🚀");
});

/* ===============================
   UPDATE PRICE ROUTE
================================ */
app.post("/update-price", async (req, res) => {
  try {
    const goldPrice = parseFloat(req.body.goldPrice);

    if (!goldPrice || goldPrice <= 0) {
      return res.json({ message: "Invalid Gold Price" });
    }

    console.log("Gold Price:", goldPrice);

    let updatedCount = 0;
    let nextPageUrl = `https://${SHOP}/admin/api/2024-01/products.json?limit=250`;

    while (nextPageUrl) {
      const productResponse = await axios.get(nextPageUrl, {
        headers: {
          "X-Shopify-Access-Token": TOKEN
        }
      });

      const products = productResponse.data.products;

      for (let product of products) {

        // Fetch metafield
        const metafieldRes = await axios.get(
          `https://${SHOP}/admin/api/2024-01/products/${product.id}/metafields.json`,
          {
            headers: { "X-Shopify-Access-Token": TOKEN }
          }
        );

        let weight = 0;

        const goldMeta = metafieldRes.data.metafields.find(
          m => m.namespace === "custom" && m.key === "gold_weight"
        );

        if (goldMeta) {
          weight = parseFloat(goldMeta.value);
        }

        if (!weight || weight <= 0) {
          console.log(`Skipped ${product.id} (No weight)`);
          continue;
        }

        const calculatedGoldValue = goldPrice * weight;

        for (let variant of product.variants) {

          // IMPORTANT FIX:
          const baseComparePrice = variant.compare_at_price
            ? parseFloat(variant.compare_at_price)
            : parseFloat(variant.price);

          const finalPrice = baseComparePrice + calculatedGoldValue;

          await axios.put(
            `https://${SHOP}/admin/api/2024-01/variants/${variant.id}.json`,
            {
              variant: {
                id: variant.id,
                price: finalPrice.toFixed(2)
              }
            },
            {
              headers: {
                "X-Shopify-Access-Token": TOKEN,
                "Content-Type": "application/json"
              }
            }
          );

          console.log(
            `Updated Variant ${variant.id} → ${finalPrice.toFixed(2)}`
          );

          updatedCount++;

          // RATE LIMIT SAFE DELAY
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }

      const linkHeader = productResponse.headers.link;

      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        nextPageUrl = match ? match[1] : null;
      } else {
        nextPageUrl = null;
      }
    }

    console.log("TOTAL UPDATED:", updatedCount);

    res.json({
      success: true,
      updated: updatedCount
    });

  } catch (error) {
    console.error("ERROR:", error.response?.data || error.message);
    res.status(500).json({
      message: "Error Updating Prices",
      error: error.response?.data || error.message
    });
  }
});

/* ===============================
   SERVER START
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
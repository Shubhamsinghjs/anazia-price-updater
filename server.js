require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHOP = process.env.SHOP;
const TOKEN = process.env.TOKEN;

/* ===============================
   UPDATE PRICE ROUTE
================================ */
app.post("/update-price", async (req, res) => {
  try {
    const goldPrice = parseFloat(req.body.goldPrice);

    if (!goldPrice || goldPrice <= 0) {
      return res.json({ message: "Invalid Gold Price" });
    }

    console.log("==================================");
    console.log("Gold Price Entered:", goldPrice);
    console.log("==================================");

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

        // Fetch product metafields
        const metafieldRes = await axios.get(
          `https://${SHOP}/admin/api/2024-01/products/${product.id}/metafields.json`,
          {
            headers: {
              "X-Shopify-Access-Token": TOKEN
            }
          }
        );

        let weight = 0;

        for (let meta of metafieldRes.data.metafields) {
          if (meta.namespace === "custom" && meta.key === "gold_weight") {
            weight = parseFloat(meta.value);
          }
        }

        if (!weight || weight <= 0) {
          console.log(`Skipped Product ${product.id} (No weight metafield)`);
          continue;
        }

        for (let variant of product.variants) {

          let basePrice = parseFloat(variant.price);
          let calculatedGoldValue = goldPrice * weight;
          let finalPrice = basePrice + calculatedGoldValue;

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
            `Updated Variant ${variant.id} | Base: ${basePrice} | Weight: ${weight} | Gold: ${goldPrice} | Final: ${finalPrice}`
          );

          updatedCount++;
        }
      }

      // Pagination check
      const linkHeader = productResponse.headers.link;

      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        nextPageUrl = match ? match[1] : null;
      } else {
        nextPageUrl = null;
      }
    }

    console.log("==================================");
    console.log("TOTAL UPDATED:", updatedCount);
    console.log("==================================");

    res.json({ message: "Prices Updated Successfully" });

  } catch (error) {
    console.error("ERROR:", error.response?.data || error.message);
    res.status(500).json({ message: "Error Updating Prices" });
  }
});

/* ===============================
   SERVER START
================================ */
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
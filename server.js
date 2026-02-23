const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const SHOP = process.env.SHOP;
const TOKEN = process.env.SHOPIFY_TOKEN;
const PORT = process.env.PORT || 3000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateVariant(variantId, newPrice, retry = 0) {
  try {
    await axios.put(
      `https://${SHOP}/admin/api/2024-01/variants/${variantId}.json`,
      {
        variant: {
          id: variantId,
          price: newPrice,
        },
      },
      {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Updated ${variantId} → ₹${newPrice}`);
    return true;
  } catch (error) {
    if (
      error.response &&
      error.response.data.errors &&
      retry < 3
    ) {
      console.log(`⚠ Rate limit hit. Retrying ${variantId}...`);
      await delay(1000);
      return updateVariant(variantId, newPrice, retry + 1);
    }

    console.log(`❌ Failed ${variantId}`);
    return false;
  }
}

app.post("/update-price", async (req, res) => {
  const goldPrice = parseFloat(req.body.goldPrice);

  if (!goldPrice) {
    return res.send("Invalid gold price");
  }

  try {
    const response = await axios.get(
      `https://${SHOP}/admin/api/2024-01/products.json?limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
        },
      }
    );

    const products = response.data.products;

    let successCount = 0;
    let failCount = 0;

    for (const product of products) {
      for (const variant of product.variants) {

        // 🔥 PRICE CALCULATION LOGIC
        const makingCharge = 500; // example
        const weight = 10; // replace with metafield if needed

        const newPrice = (goldPrice * weight) + makingCharge;

        const updated = await updateVariant(
          variant.id,
          newPrice.toFixed(2)
        );

        if (updated) successCount++;
        else failCount++;

        await delay(500); // 👈 IMPORTANT FOR 300 PRODUCTS
      }
    }

    console.log(`🎉 Done! Success: ${successCount}, Failed: ${failCount}`);

    res.send(
      `Updated Successfully!<br>Success: ${successCount}<br>Failed: ${failCount}`
    );
  } catch (error) {
    console.log(error.message);
    res.send("Error updating prices");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
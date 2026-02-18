import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

/* PATH */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

/* EMBED FIX */

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com"
  );
  next();
});

/* ENV */

const SHOP = process.env.SHOP;
const TOKEN = process.env.SHOPIFY_TOKEN;

/* ROOT UI */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public/index.html")
  );
});

/* GET PRODUCTS */

async function getProducts() {

  const res = await axios.get(
    `https://${SHOP}/admin/api/2023-10/products.json`,
    {
      headers: {
        "X-Shopify-Access-Token": TOKEN,
      },
    }
  );

  return res.data.products;
}

/* GET PRODUCT METAFIELDS */

async function getProductMetafields(productId) {

  const res = await axios.get(
    `https://${SHOP}/admin/api/2023-10/products/${productId}/metafields.json`,
    {
      headers: {
        "X-Shopify-Access-Token": TOKEN,
      },
    }
  );

  return res.data.metafields;
}

/* UPDATE PRICE */

app.post("/update-prices", async (req, res) => {

  const { goldRate } = req.body;

  try {

    const products = await getProducts();

    for (const product of products) {

      /* PRODUCT METAFIELD FETCH */

      const metafields =
        await getProductMetafields(product.id);

      let goldWeight = 0;

      metafields.forEach((mf) => {

        if (
          mf.namespace === "custom" &&
          mf.key === "gold_weight"
        ) {
          goldWeight =
            parseFloat(mf.value);
        }
      });

      /* LOOP VARIANTS */

      for (const variant of product.variants) {

        const basePrice =
          parseFloat(variant.price);

        const goldValue =
          goldWeight * goldRate;

        const finalPrice =
          basePrice + goldValue;

        /* UPDATE */

        await axios.put(
          `https://${SHOP}/admin/api/2023-10/variants/${variant.id}.json`,
          {
            variant: {
              id: variant.id,
              price: finalPrice.toFixed(2),
            },
          },
          {
            headers: {
              "X-Shopify-Access-Token": TOKEN,
              "Content-Type": "application/json",
            },
          }
        );

        console.log(
          `Updated ${variant.id} → ₹${finalPrice}`
        );
      }
    }

    res.send("Prices Updated Successfully ✅");

  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send("Error updating");
  }
});

/* SERVER */

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

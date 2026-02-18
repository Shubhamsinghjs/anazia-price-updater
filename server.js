/* =========================================================
   IMPORTS
========================================================= */

import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

/* =========================================================
   APP INIT
========================================================= */

const app = express();
app.use(express.json());

/* =========================================================
   PATH FIX (ES MODULE SUPPORT)
========================================================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   STATIC UI SERVE
========================================================= */

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   EMBEDDED APP IFRAME FIX
========================================================= */

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com"
  );
  next();
});

/* =========================================================
   ENV VARIABLES
========================================================= */

const SHOP = process.env.SHOP;
const TOKEN = process.env.SHOPIFY_TOKEN;

/* =========================================================
   ROOT ROUTE → LOAD UI
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public/index.html")
  );
});

/* =========================================================
   GET ALL PRODUCTS
========================================================= */

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

/* =========================================================
   GET VARIANT METAFIELDS
========================================================= */

async function getMetafields(variantId) {

  const res = await axios.get(
    `https://${SHOP}/admin/api/2023-10/variants/${variantId}/metafields.json`,
    {
      headers: {
        "X-Shopify-Access-Token": TOKEN,
      },
    }
  );

  return res.data.metafields;
}

/* =========================================================
   UPDATE PRICES (GOLD ONLY)
========================================================= */

app.post("/update-prices", async (req, res) => {

  const { goldRate } = req.body;

  if (!goldRate)
    return res.send("Gold rate missing");

  try {

    const products = await getProducts();

    for (const product of products) {

      for (const variant of product.variants) {

        /* ---------- METAFIELDS ---------- */

        const metafields =
          await getMetafields(variant.id);

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

        /* ---------- BASE PRICE ---------- */

        const basePrice =
          parseFloat(variant.price);

        /* ---------- CALCULATION ---------- */

        const goldValue =
          goldWeight * goldRate;

        const finalPrice =
          basePrice + goldValue;

        /* ---------- UPDATE VARIANT ---------- */

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
          `Updated Variant ${variant.id} → ₹${finalPrice}`
        );
      }
    }

    res.send("All Website Prices Updated ✅");

  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send("Price update error");
  }
});

/* =========================================================
   SERVER START
========================================================= */

app.listen(3000, () => {
  console.log("=================================");
  console.log("Server running on port 3000");
  console.log("=================================");
});

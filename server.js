require("dotenv").config({ path: ".env" });

const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

if (!SHOP || !TOKEN) {
  console.log("Missing Shopify ENV");
  process.exit(1);
}

let GLOBAL_GOLD_RATE = 0;

/* ===============================
DELAY (RATE LIMIT SAFE)
================================ */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ===============================
SAFE SHOPIFY FETCH + RETRY
================================ */

async function shopifyFetch(url, options = {}, retry = 3) {

  try {

    const res = await fetch(url, options);

    if (res.status === 429) {

      console.log("⚠️ Shopify Rate Limit... waiting");

      await sleep(1200);

      if (retry > 0) return shopifyFetch(url, options, retry - 1);

    }

    if (!res.ok) {

      const txt = await res.text();
      console.log("Shopify Error:", txt);

      throw new Error("Shopify API Error");

    }

    return res;

  } catch (err) {

    if (retry > 0) {

      console.log("Retrying request...");
      await sleep(1000);

      return shopifyFetch(url, options, retry - 1);

    }

    throw err;

  }

}

/* ===============================
GET ALL PRODUCTS
================================ */

async function getAllProducts() {

  let products = [];
  let url = `https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

  while (url) {

    const res = await shopifyFetch(url, {
      headers: { "X-Shopify-Access-Token": TOKEN }
    });

    const data = await res.json();

    products = products.concat(data.products);

    const link = res.headers.get("link");

    if (link && link.includes('rel="next"')) {

      const match = link.match(/<([^>]+)>; rel="next"/);

      url = match ? match[1] : null;

    } else {

      url = null;

    }

    await sleep(300);

  }

  return products;

}

/* ===============================
PRODUCTS API
================================ */

app.get("/api/products", async (req, res) => {

  try {

    const page = parseInt(req.query.page) || 1;
    const q = req.query.q || "";
    const limit = 20;

    const products = await getAllProducts();

    let filtered = products;

    if (q) {

      filtered = products.filter(p =>
        p.title.toLowerCase().includes(q.toLowerCase())
      );

    }

    const start = (page - 1) * limit;
    const end = start + limit;

    res.json({
      products: filtered.slice(start, end),
      currentPage: page,
      totalPages: Math.ceil(filtered.length / limit)
    });

  } catch (err) {

    console.log(err);

    res.json({ products: [] });

  }

});

/* ===============================
VARIANTS
================================ */

app.get("/api/variants/:id", async (req, res) => {

  const r = await shopifyFetch(
    `https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json`,
    { headers: { "X-Shopify-Access-Token": TOKEN } }
  );

  const data = await r.json();

  res.json(data.product.variants);

});

/* ===============================
SAVE VARIANT CONFIG
================================ */

app.post("/api/save-variant", async (req, res) => {

  const { id, weight, diamond, making, gst } = req.body;

  await shopifyFetch(
    `https://${SHOP}/admin/api/2023-10/variants/${id}/metafields.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        metafield: {
          namespace: "custom",
          key: "gold_config",
          type: "json",
          value: JSON.stringify({ weight, diamond, making, gst })
        }
      })
    }
  );

  res.json({ success: true });

});

/* ===============================
UPDATE GOLD PRICE
================================ */

app.post("/api/set-gold", async (req, res) => {

  GLOBAL_GOLD_RATE = parseFloat(req.body.rate) || 0;

  const products = await getAllProducts();

  let updated = 0;

  for (const p of products) {

    for (const v of p.variants) {

      try {

        const metaRes = await shopifyFetch(
          `https://${SHOP}/admin/api/2023-10/variants/${v.id}/metafields.json`,
          { headers: { "X-Shopify-Access-Token": TOKEN } }
        );

        const metaData = await metaRes.json();

        const config = metaData.metafields.find(m => m.key === "gold_config");

        if (!config) continue;

        const parsed = JSON.parse(config.value);

        const weight = parseFloat(parsed.weight || 0);
        const diamond = parseFloat(parsed.diamond || 0);
        const making = parseFloat(parsed.making || 0);
        const gst = parseFloat(parsed.gst || 0);

        const goldTotal = GLOBAL_GOLD_RATE * weight;

        const subtotal = goldTotal + diamond + making;

        const final = subtotal + (subtotal * (gst / 100));

        await shopifyFetch(
          `https://${SHOP}/admin/api/2023-10/variants/${v.id}.json`,
          {
            method: "PUT",
            headers: {
              "X-Shopify-Access-Token": TOKEN,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              variant: {
                id: v.id,
                price: final.toFixed(2)
              }
            })
          }
        );

        console.log(
          "Updated:",
          p.title,
          "| Variant:",
          v.id,
          "| Price:",
          final.toFixed(2)
        );

        updated++;

        await sleep(600);

      } catch (err) {

        console.log("Skip Variant:", v.id);

      }

    }

  }

  res.json({ updated });

});

app.listen(PORT, () => console.log("ANAZIA SERVER RUNNING"));
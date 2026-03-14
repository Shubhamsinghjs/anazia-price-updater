require("dotenv").config({ path: ".env" });

const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");

const app = express();
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

const DATA_FILE = "./variant-data.json";

/* ===============================
LOAD CONFIG
================================ */

let VARIANT_CONFIG = {};

try {
if (fs.existsSync(DATA_FILE)) {
VARIANT_CONFIG = JSON.parse(fs.readFileSync(DATA_FILE));
}
} catch {
VARIANT_CONFIG = {};
}

/* ===============================
SAVE CONFIG
================================ */

function saveConfig() {
fs.writeFileSync(DATA_FILE, JSON.stringify(VARIANT_CONFIG, null, 2));
}

/* ===============================
SAFE FETCH
================================ */

async function shopifyFetch(url, options = {}, retry = 2) {

try {

const res = await fetch(url, options);

if (!res.ok) {

const txt = await res.text();

if (txt.includes("Not Found")) {
console.log("Variant Not Found — Skipped");
return null;
}

if (retry > 0) {
console.log("Retrying Shopify API...");
await sleep(2000);
return shopifyFetch(url, options, retry - 1);
}

throw new Error(txt);

}

return res;

} catch (err) {

if (retry > 0) {
await sleep(2000);
return shopifyFetch(url, options, retry - 1);
}

throw err;

}

}

/* ===============================
SLEEP
================================ */

function sleep(ms) {
return new Promise(resolve => setTimeout(resolve, ms));
}

/* ===============================
PRODUCT CACHE
================================ */

let PRODUCT_CACHE = [];
let CACHE_TIME = 0;

async function getAllProducts() {

if (PRODUCT_CACHE.length > 0 && Date.now() - CACHE_TIME < 1000 * 60 * 30) {
return PRODUCT_CACHE;
}

let products = [];
let url = `https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

while (url) {

const res = await shopifyFetch(url, {
headers: {
"X-Shopify-Access-Token": TOKEN
}
});

if (!res) break;

const data = await res.json();

products = products.concat(data.products);

const link = res.headers.get("link");

if (link && link.includes('rel="next"')) {
const match = link.match(/<([^>]+)>; rel="next"/);
url = match ? match[1] : null;
} else {
url = null;
}

}

PRODUCT_CACHE = products;
CACHE_TIME = Date.now();

console.log("Products Loaded:", products.length);

return products;

}

/* ===============================
PRODUCT API
================================ */

app.get("/api/products", async (req, res) => {

const page = parseInt(req.query.page) || 1;
const limit = 20;
const q = req.query.q || "";

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

});

/* ===============================
VARIANTS
================================ */

app.get("/api/variants/:id", async (req, res) => {

const r = await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json`,
{
headers: {
"X-Shopify-Access-Token": TOKEN
}
}
);

if (!r) return res.json([]);

const data = await r.json();

res.json(data.product.variants);

});

/* ===============================
SAVE VARIANT
================================ */

app.post("/api/save-variant", (req, res) => {

const { id, weight, diamond, making, gst } = req.body;

VARIANT_CONFIG[id] = { weight, diamond, making, gst };

saveConfig();

console.log("Config Saved:", id);

res.json({ success: true });

});

/* ===============================
UPDATE PRICE
================================ */

app.post("/api/set-gold", async (req, res) => {

const rate = parseFloat(req.body.rate) || 0;

let updated = 0;
let skipped = 0;

const ids = Object.keys(VARIANT_CONFIG);

console.log("Total Variants:", ids.length);

for (const id of ids) {

const conf = VARIANT_CONFIG[id];

const weight = parseFloat(conf.weight || 0);
const diamond = parseFloat(conf.diamond || 0);
const making = parseFloat(conf.making || 0);
const gst = parseFloat(conf.gst || 0);

const gold = rate * weight;

const subtotal = gold + diamond + making;

const final = subtotal + (subtotal * gst / 100);

const price = parseFloat(final).toFixed(2);

const r = await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/variants/${id}.json`,
{
method: "PUT",
headers: {
"X-Shopify-Access-Token": TOKEN,
"Content-Type": "application/json"
},
body: JSON.stringify({
variant: {
id: id,
price: price
}
})
}
);

if (r) {
updated++;
console.log("Updated:", id, price);
} else {
skipped++;
}

await sleep(1200); // API SAFE DELAY

}

res.json({
updated,
skipped
});

});

/* ===============================
SERVER
================================ */

app.listen(PORT, () => {
console.log("ANAZIA SERVER RUNNING ON", PORT);
});
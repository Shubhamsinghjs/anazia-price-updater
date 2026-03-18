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

let VARIANT_CONFIG = {};

if (fs.existsSync(DATA_FILE)) {
  VARIANT_CONFIG = JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveConfig() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(VARIANT_CONFIG, null, 2));
}

/* =========================
SHOPIFY FETCH
========================= */

async function shopifyFetch(url, options = {}) {
  const res = await fetch(url, options);

  if (!res.ok) {
    const txt = await res.text();
    console.log("Shopify Error:", txt);
    return null;
  }

  return res;
}

/* =========================
PRODUCT CACHE
========================= */

let PRODUCT_CACHE = [];

async function getAllProducts() {
  if (PRODUCT_CACHE.length > 0) return PRODUCT_CACHE;

  let products = [];
  let url = `https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

  while (url) {
    const res = await shopifyFetch(url, {
      headers: { "X-Shopify-Access-Token": TOKEN }
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
  console.log("Products Loaded:", products.length);

  return products;
}

/* =========================
UI PANEL
========================= */

app.get("/", (req, res) => {
  res.send(`
<html>
<head>
<title>ANAZIA GOLD PANEL</title>
<style>
body{font-family:Arial;background:#f3f5f7;padding:30px;}
.card{background:white;padding:20px;border-radius:10px;margin-bottom:20px;}
.product{background:white;padding:15px;margin-bottom:10px;border-radius:8px;}
.variant{background:#fafafa;padding:10px;margin-top:10px;border-radius:6px;}
button{padding:6px 12px;background:black;color:white;border:none;border-radius:6px;}
input{padding:6px;margin:5px;}
</style>
</head>
<body>

<h1>ANAZIA GOLD PRICING PANEL</h1>

<div class="card">
Gold 12KT ₹/gram <input id="rate12"><br>
Gold 14KT ₹/gram <input id="rate14"><br><br>

<button onclick="updateGold()">Update Whole Website</button>
<p id="status"></p>
</div>

<div class="card">
<input id="searchInput" placeholder="Search product">
<button onclick="loadProducts()">Search</button>
</div>

<div id="productContainer"></div>

<script>

async function updateGold(){
const rate12=document.getElementById("rate12").value;
const rate14=document.getElementById("rate14").value;

document.getElementById("status").innerText="Updating...";

const res=await fetch('/api/set-gold',{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({rate12,rate14})
});

const data=await res.json();
document.getElementById("status").innerText="Updated "+data.updated;
}

async function loadProducts(){
const q=document.getElementById("searchInput").value;

const res=await fetch('/api/products?q='+q);
const data=await res.json();

let html="";

data.products.forEach(p=>{
html+=\`
<div class="product">
<b>\${p.title}</b>
<button onclick="loadVariants(\${p.id})">Configure</button>
<div id="v-\${p.id}"></div>
</div>\`;
});

document.getElementById("productContainer").innerHTML=html;
}

async function loadVariants(id){
const res=await fetch('/api/variants/'+id);
const variants=await res.json();

let html="";

variants.forEach(v=>{
html+=\`
<div class="variant">
<b>\${v.title}</b><br>
Weight <input id="w-\${v.id}">
Diamond <input id="d-\${v.id}">
Making <input id="m-\${v.id}">
GST <input id="g-\${v.id}">
<button onclick="saveVariant(\${v.id},'\${v.title}')">Save</button>
</div>\`;
});

document.getElementById("v-"+id).innerHTML=html;
}

async function saveVariant(id,title){
const weight=document.getElementById("w-"+id).value;
const diamond=document.getElementById("d-"+id).value;
const making=document.getElementById("m-"+id).value;
const gst=document.getElementById("g-"+id).value;

await fetch('/api/save-variant',{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({id,weight,diamond,making,gst,title})
});

alert("Saved");
}

loadProducts();

</script>

</body>
</html>
`);
});

/* =========================
API
========================= */

app.get("/api/products", async (req, res) => {
  const q = req.query.q || "";
  const products = await getAllProducts();

  const filtered = products.filter(p =>
    p.title.toLowerCase().includes(q.toLowerCase())
  );

  res.json({ products: filtered.slice(0, 20) });
});

app.get("/api/variants/:id", async (req, res) => {
  const r = await shopifyFetch(
    `https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json`,
    { headers: { "X-Shopify-Access-Token": TOKEN } }
  );

  if (!r) return res.json([]);

  const data = await r.json();
  res.json(data.product.variants);
});

/* SAVE */

app.post("/api/save-variant", (req, res) => {
  const { id, weight, diamond, making, gst, title } = req.body;

  let kt = "14KT";

  if (title.toUpperCase().includes("12KT")) kt = "12KT";
  if (title.toUpperCase().includes("14KT")) kt = "14KT";

  VARIANT_CONFIG[id] = { weight, diamond, making, gst, kt };

  saveConfig();

  console.log("SAVED:", id, kt);

  res.json({ success: true });
});

/* UPDATE */

app.post("/api/set-gold", async (req, res) => {
  const rate12 = parseFloat(req.body.rate12) || 0;
  const rate14 = parseFloat(req.body.rate14) || 0;

  let updated = 0;

  for (const id in VARIANT_CONFIG) {
    const conf = VARIANT_CONFIG[id];

    const weight = parseFloat(conf.weight || 0);
    const diamond = parseFloat(conf.diamond || 0);
    const making = parseFloat(conf.making || 0);
    const gst = parseFloat(conf.gst || 0);

    const rate = conf.kt === "12KT" ? rate12 : rate14;

    const gold = rate * weight;
    const subtotal = gold + diamond + making;
    const final = subtotal + subtotal * (gst / 100);

    const price = final.toFixed(2);

    await shopifyFetch(
      `https://${SHOP}/admin/api/2023-10/variants/${id}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          variant: { id, price }
        })
      }
    );

    console.log("UPDATED:", id, conf.kt, price);

    updated++;

    await new Promise(r => setTimeout(r, 1200));
  }

  res.json({ updated });
});

/* =========================
SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log("ANAZIA SERVER RUNNING");
});
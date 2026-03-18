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

let VARIANT_CONFIG = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE))
  : {};

function saveConfig() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(VARIANT_CONFIG, null, 2));
}

/* ================= SHOPIFY ================= */

async function shopifyFetch(url, options = {}) {
  const res = await fetch(url, options);

  if (!res.ok) {
    const txt = await res.text();
    console.log("❌ Shopify Error:", txt);
    return null;
  }

  return res;
}

/* ================= PRODUCTS ================= */

async function getAllProducts() {
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

  console.log("✅ Products Loaded:", products.length);

  return products;
}

/* ================= UI ================= */

app.get("/", (req, res) => {
  res.send(`
<html>
<head>
<style>
body{font-family:Arial;background:#f4f6f8;padding:30px;}
.card{background:#fff;padding:20px;border-radius:10px;margin-bottom:20px;}
button{background:#000;color:#fff;padding:6px 12px;border:none;border-radius:6px;}
input{padding:6px;margin:5px;}
.product{padding:10px;background:#fff;margin-bottom:10px;border-radius:8px;}
</style>
</head>

<body>

<h1>ANAZIA GOLD PANEL</h1>

<div class="card">
12KT <input id="r12">
14KT <input id="r14">
<button onclick="update()">Update</button>
<p id="status"></p>
</div>

<div class="card">
<input id="q">
<button onclick="load()">Search</button>
</div>

<div id="data"></div>

<script>

async function update(){
const r12=document.getElementById("r12").value;
const r14=document.getElementById("r14").value;

document.getElementById("status").innerText="Updating...";

const res=await fetch('/api/set-gold',{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({r12,r14})
});

const d=await res.json();
document.getElementById("status").innerText="Updated "+d.updated;
}

async function load(){

const q=document.getElementById("q").value;

const res=await fetch('/api/products?q='+q);
const d=await res.json();

let html="";

d.products.forEach(p=>{
html+=\`
<div class="product">
<b>\${p.title}</b>
<button onclick="v(\${p.id})">Open</button>
<div id="v-\${p.id}"></div>
</div>\`;
});

document.getElementById("data").innerHTML=html;
}

async function v(id){

const res=await fetch('/api/variants/'+id);
const d=await res.json();

let html="";

d.forEach(x=>{
html+=\`
<div>
\${x.title}
<input id="w-\${x.id}" placeholder="weight">
<input id="d-\${x.id}" placeholder="diamond">
<input id="m-\${x.id}" placeholder="making">
<input id="g-\${x.id}" placeholder="gst">
<button onclick="s(\${x.id},'\${x.title}')">save</button>
</div>\`;
});

document.getElementById("v-"+id).innerHTML=html;
}

async function s(id,title){

await fetch('/api/save-variant',{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
id,
title,
weight:document.getElementById("w-"+id).value,
diamond:document.getElementById("d-"+id).value,
making:document.getElementById("m-"+id).value,
gst:document.getElementById("g-"+id).value
})
});

alert("Saved");
}

load();

</script>

</body>
</html>
`);
});

/* ================= PRODUCTS ================= */

app.get("/api/products", async (req, res) => {
  const q = req.query.q || "";
  const products = await getAllProducts();

  const filtered = products.filter(p =>
    p.title.toLowerCase().includes(q.toLowerCase())
  );

  res.json({ products: filtered.slice(0, 50) });
});

/* ================= VARIANTS ================= */

app.get("/api/variants/:id", async (req, res) => {
  const r = await shopifyFetch(
    `https://${SHOP}/admin/api/2023-10/products/\${req.params.id}.json`,
    { headers: { "X-Shopify-Access-Token": TOKEN } }
  );

  if (!r) return res.json([]);

  const data = await r.json();

  console.log("👉 Variants Loaded:", data.product.variants.length);

  res.json(data.product.variants);
});

/* ================= SAVE ================= */

app.post("/api/save-variant", (req, res) => {
  const { id, title, weight, diamond, making, gst } = req.body;

  const kt = title.toUpperCase().includes("12KT") ? "12KT" : "14KT";

  VARIANT_CONFIG[id] = { title, kt, weight, diamond, making, gst };

  saveConfig();

  console.log("✅ SAVED:", id, kt, title);

  res.json({ ok: true });
});

/* ================= UPDATE ================= */

app.post("/api/set-gold", async (req, res) => {

  const r12 = parseFloat(req.body.r12) || 0;
  const r14 = parseFloat(req.body.r14) || 0;

  let updated = 0;

  for (const id in VARIANT_CONFIG) {

    const v = VARIANT_CONFIG[id];

    const rate = v.kt === "12KT" ? r12 : r14;

    const gold = rate * (v.weight || 0);
    const subtotal = gold + (+v.diamond || 0) + (+v.making || 0);
    const final = subtotal + subtotal * ((+v.gst || 0) / 100);

    const price = final.toFixed(2);

    await shopifyFetch(
      `https://${SHOP}/admin/api/2023-10/variants/\${id}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ variant: { id, price } })
      }
    );

    console.log("🔥 UPDATED:", id, price);

    updated++;

    await new Promise(r => setTimeout(r, 500)); // SAFE
  }

  console.log("✅ TOTAL UPDATED:", updated);

  res.json({ updated });

});

/* ================= SERVER ================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 SERVER RUNNING");
});
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

  console.log("Products Loaded:", products.length);
  return products;
}

/* ================= UI ================= */

app.get("/", (req, res) => {
  res.send(`
<html>
<body style="font-family:Arial;padding:30px">

<h1>ANAZIA GOLD PANEL</h1>

<!-- GOLD INPUT -->
<div>
12KT <input id="rate12"><br><br>
14KT <input id="rate14"><br><br>
<button onclick="updateGold()">Update</button>
<p id="status"></p>
</div>

<hr>

<input id="search" placeholder="search">
<button onclick="load()">Search</button>

<div id="data"></div>

<script>

async function updateGold(){
const rate12=document.getElementById("rate12").value;
const rate14=document.getElementById("rate14").value;

const res=await fetch('/api/set-gold',{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({rate12,rate14})
});

const d=await res.json();
document.getElementById("status").innerText="Updated "+d.updated;
}

async function load(){
const q=document.getElementById("search").value;

const res=await fetch('/api/products?q='+q);
const d=await res.json();

let html="";

d.products.forEach(p=>{
html+=\`
<div>
<b>\${p.title}</b>
<button onclick="variants(\${p.id})">Open</button>
<div id="v-\${p.id}"></div>
</div>\`;
});

document.getElementById("data").innerHTML=html;
}

async function variants(id){

const res=await fetch('/api/variants/'+id);
const v=await res.json();

let html="";

v.forEach(x=>{

html+=\`
<div style="border:1px solid #ddd;margin:10px;padding:10px">

<b>\${x.title}</b><br>

Weight <input id="w-\${x.id}">
Diamond <input id="d-\${x.id}">
Making <input id="m-\${x.id}">
GST <input id="g-\${x.id}">

<button onclick="save(\${x.id},'\${x.title}')">Save</button>

</div>\`;

});

document.getElementById("v-"+id).innerHTML=html;
}

async function save(id,title){

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

load();

</script>

</body>
</html>
`);
});

/* ================= SAVE ================= */

app.post("/api/save-variant", (req, res) => {
  const { id, weight, diamond, making, gst, title } = req.body;

  let kt = title.toUpperCase().includes("12KT") ? "12KT" : "14KT";

  VARIANT_CONFIG[id] = {
    weight,
    diamond,
    making,
    gst,
    kt,
    title
  };

  saveConfig();

  console.log("✅ SAVED VARIANT:", {
    id,
    title,
    kt,
    weight
  });

  res.json({ ok: true });
});

/* ================= UPDATE ================= */

app.post("/api/set-gold", async (req, res) => {

  const rate12 = parseFloat(req.body.rate12) || 0;
  const rate14 = parseFloat(req.body.rate14) || 0;

  let updated = 0;

  for (const id in VARIANT_CONFIG) {

    const v = VARIANT_CONFIG[id];

    const rate = v.kt === "12KT" ? rate12 : rate14;

    const weight = parseFloat(v.weight || 0);
    const diamond = parseFloat(v.diamond || 0);
    const making = parseFloat(v.making || 0);
    const gst = parseFloat(v.gst || 0);

    const gold = rate * weight;
    const subtotal = gold + diamond + making;
    const final = subtotal + subtotal * (gst / 100);

    const price = final.toFixed(2);

    await shopifyFetch(
      `https://${SHOP}/admin/api/2023-10/variants/\${id}.json`,
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

    console.log("🔥 UPDATED:", {
      id,
      title: v.title,
      kt: v.kt,
      price
    });

    updated++;

    await new Promise(r => setTimeout(r, 1200));
  }

  res.json({ updated });
});

/* ================= VARIANTS ================= */

app.get("/api/variants/:id", async (req, res) => {

  const r = await shopifyFetch(
    `https://${SHOP}/admin/api/2023-10/products/\${req.params.id}.json`,
    { headers: { "X-Shopify-Access-Token": TOKEN } }
  );

  if (!r) return res.json([]);

  const data = await r.json();
  res.json(data.product.variants);

});

/* ================= PRODUCTS ================= */

app.get("/api/products", async (req, res) => {

  const q = req.query.q || "";
  const p = await getAllProducts();

  const f = p.filter(x =>
    x.title.toLowerCase().includes(q.toLowerCase())
  );

  res.json({ products: f.slice(0, 20) });

});

/* ================= SERVER ================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 SERVER RUNNING");
});
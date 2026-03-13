require("dotenv").config({ path: ".env" });

const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

const DATA_FILE = "./variant-data.json";

/* ===============================
LOAD VARIANT CONFIG
================================ */

let VARIANT_CONFIG = {};

if (fs.existsSync(DATA_FILE)) {
  VARIANT_CONFIG = JSON.parse(fs.readFileSync(DATA_FILE));
}

/* ===============================
SAVE CONFIG
================================ */

function saveConfig() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(VARIANT_CONFIG, null, 2));
}

/* ===============================
SAFE SHOPIFY FETCH
================================ */

async function shopifyFetch(url, options = {}) {

  try {

    const res = await fetch(url, options);

    if (!res.ok) {
      const txt = await res.text();
      console.log("Shopify Error:", txt);
      return null;
    }

    return res;

  } catch (err) {

    console.log("Fetch Error:", err.message);
    return null;

  }

}

/* ===============================
APP UI
================================ */

app.get("/", (req, res) => {

res.send(`
<html>
<head>
<title>Anazia Price Updater</title>

<style>

body{
font-family:Arial;
background:#f5f6f8;
padding:40px;
}

.card{
background:white;
padding:30px;
border-radius:10px;
width:400px;
box-shadow:0 3px 10px rgba(0,0,0,0.1);
}

button{
padding:10px 20px;
border:none;
background:black;
color:white;
cursor:pointer;
border-radius:6px;
}

input{
padding:8px;
width:120px;
margin-right:10px;
}

</style>

</head>

<body>

<h2>Anazia Gold Price Updater</h2>

<div class="card">

Gold Rate ₹/gram

<br><br>

<input id="rate">

<button onclick="update()">Update Prices</button>

<p id="status"></p>

</div>

<script>

async function update(){

const rate=document.getElementById("rate").value;

document.getElementById("status").innerText="Updating...";

const res = await fetch('/api/set-gold',{
method:"POST",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({rate})
});

const data = await res.json();

document.getElementById("status").innerText="Updated "+data.updated+" variants";

}

</script>

</body>
</html>
`);

});

/* ===============================
SAVE VARIANT CONFIG
================================ */

app.post("/api/save-variant", (req, res) => {

const { id, weight, diamond, making, gst } = req.body;

VARIANT_CONFIG[id] = { weight, diamond, making, gst };

saveConfig();

console.log("Saved:", id);

res.json({ success: true });

});

/* ===============================
UPDATE VARIANT PRICES
================================ */

app.post("/api/set-gold", async (req, res) => {

const rate = parseFloat(req.body.rate) || 0;

let updated = 0;

console.log("Starting update...");

for (const id in VARIANT_CONFIG) {

const conf = VARIANT_CONFIG[id];

const weight = parseFloat(conf.weight || 0);
const diamond = parseFloat(conf.diamond || 0);
const making = parseFloat(conf.making || 0);
const gst = parseFloat(conf.gst || 3);

const gold = rate * weight;

const subtotal = gold + diamond + making;

const final = subtotal + (subtotal * (gst / 100));

const price = parseFloat(final).toFixed(2);

const resShopify = await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/variants/\${id}.json`,
{
method: "PUT",
headers: {
"X-Shopify-Access-Token": TOKEN,
"Content-Type": "application/json"
},
body: JSON.stringify({
variant: { id: id, price: price }
})
}
);

if (resShopify) {

console.log("Updated:", id, price);
updated++;

} else {

console.log("Skipped:", id);

}

/* RATE LIMIT FIX */

await new Promise(r => setTimeout(r, 800));

}

console.log("Update finished:", updated);

res.json({ updated });

});

/* ===============================
SERVER
================================ */

app.listen(PORT, () => {
console.log("ANAZIA SERVER RUNNING ON", PORT);
});
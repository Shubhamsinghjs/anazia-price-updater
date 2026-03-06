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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ===============================
SAFE SHOPIFY FETCH
================================ */

async function shopifyFetch(url, options = {}, retry = 3) {

  const res = await fetch(url, options);

  if (res.status === 401) {

    const txt = await res.text();
    console.log("INVALID TOKEN:", txt);

    throw new Error("Invalid Token");

  }

  if (res.status === 429) {

    console.log("Rate limit hit, waiting...");

    await sleep(1500);

    if (retry > 0) {
      return shopifyFetch(url, options, retry - 1);
    }

  }

  if (!res.ok) {

    const txt = await res.text();
    console.log("Shopify Error:", txt);

    throw new Error("Shopify API Error");

  }

  await sleep(350);

  return res;

}

/* ===============================
GET ALL PRODUCTS
================================ */

async function getAllProducts() {

  let products = [];

  let url = `https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

  while (url) {

    const res = await shopifyFetch(url, {
      headers: {
        "X-Shopify-Access-Token": TOKEN
      }
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

  }

  console.log("Products fetched:", products.length);

  return products;

}

/* ===============================
MAIN UI
================================ */

app.get("/", (req, res) => {

res.send(`

<html>
<head>

<title>ANAZIA GOLD PANEL</title>

<style>

body{
font-family:Arial;
background:#f4f6f8;
padding:30px;
}

h1{
font-size:28px;
margin-bottom:20px;
}

.tabs button{
padding:10px 20px;
border:none;
background:#ddd;
margin-right:10px;
cursor:pointer;
border-radius:6px;
font-weight:bold;
}

.tabs button:hover{
background:black;
color:white;
}

.section{
display:none;
}

.active{
display:block;
}

.card{
background:white;
padding:20px;
border-radius:10px;
box-shadow:0 3px 8px rgba(0,0,0,0.08);
margin-bottom:20px;
}

input{
padding:8px;
border:1px solid #ddd;
border-radius:6px;
margin:5px;
}

button.primary{
padding:8px 16px;
background:black;
color:white;
border:none;
border-radius:6px;
cursor:pointer;
}

.product{
background:white;
border-radius:8px;
padding:15px;
margin-bottom:12px;
box-shadow:0 2px 6px rgba(0,0,0,0.05);
}

.variant{
background:#fafafa;
padding:10px;
margin-top:10px;
border-radius:6px;
border:1px solid #eee;
}

.pagination button{
padding:6px 12px;
background:black;
color:white;
border:none;
border-radius:6px;
margin-right:5px;
cursor:pointer;
}

</style>

</head>

<body>

<h1>ANAZIA GOLD – PRICING PANEL</h1>

<div class="tabs">
<button onclick="showTab('pricing')">Pricing Panel</button>
<button onclick="showTab('products')">Products</button>
</div>

<div id="pricing" class="section active">

<div class="card">

<h3>Gold Rate ₹/gram</h3>

<input id="goldRate" placeholder="Enter gold rate">

<button class="primary" onclick="updateGold()">
Update Whole Website
</button>

<p id="status"></p>

</div>

</div>

<div id="products" class="section">

<div class="card">

<h3>Search Product</h3>

<input id="searchInput" placeholder="Search by title">

<button class="primary" onclick="loadProducts(1)">
Search
</button>

</div>

<div id="productContainer"></div>

<div class="pagination" id="pagination"></div>

</div>

<script>

let currentPage = 1;

function showTab(id){

document.getElementById("pricing").classList.remove("active");
document.getElementById("products").classList.remove("active");

document.getElementById(id).classList.add("active");

}

async function updateGold(){

const rate = document.getElementById("goldRate").value;

document.getElementById("status").innerText="Updating...";

const res = await fetch('/api/set-gold',{
method:"POST",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({rate})
});

const data = await res.json();

document.getElementById("status").innerText="Updated Variants: "+data.updated;

}

async function loadProducts(page=1){

currentPage = page;

const q = document.getElementById("searchInput").value;

const res = await fetch('/api/products?page='+page+'&q='+q);

const data = await res.json();

let html = "";

data.products.forEach(p=>{

html += \`
<div class="product">

<b>\${p.title}</b>

<button class="primary" onclick="loadVariants(\${p.id})">
Configure
</button>

<div id="variants-\${p.id}"></div>

</div>
\`;

});

document.getElementById("productContainer").innerHTML = html;

let pag = "";

if(data.currentPage>1){
pag += \`<button onclick="loadProducts(\${data.currentPage-1})">Prev</button>\`;
}

if(data.currentPage<data.totalPages){
pag += \`<button onclick="loadProducts(\${data.currentPage+1})">Next</button>\`;
}

document.getElementById("pagination").innerHTML = pag;

}

async function loadVariants(productId){

const res = await fetch('/api/variants/'+productId);

const variants = await res.json();

let html = "";

variants.forEach(v=>{

html += \`
<div class="variant">

<b>\${v.title}</b><br>
Variant ID: \${v.id}<br><br>

Weight <input id="weight-\${v.id}">
Diamond <input id="diamond-\${v.id}">
Making <input id="making-\${v.id}">
GST % <input id="gst-\${v.id}">

<button class="primary" onclick="saveVariant(\${v.id})">
Save
</button>

</div>
\`;

});

document.getElementById("variants-"+productId).innerHTML = html;

}

async function saveVariant(id){

const weight = document.getElementById("weight-"+id).value;
const diamond = document.getElementById("diamond-"+id).value;
const making = document.getElementById("making-"+id).value;
const gst = document.getElementById("gst-"+id).value;

await fetch('/api/save-variant',{
method:"POST",
headers:{ "Content-Type":"application/json" },
body: JSON.stringify({id,weight,diamond,making,gst})
});

alert("Saved Successfully");

}

loadProducts();

</script>

</body>
</html>

`);

});

/* ===============================
PRODUCTS API
================================ */

app.get("/api/products", async (req,res)=>{

try{

const page = parseInt(req.query.page)||1;
const q = req.query.q||"";
const limit = 20;

const products = await getAllProducts();

let filtered = products;

if(q){

filtered = products.filter(p =>
p.title.toLowerCase().includes(q.toLowerCase())
);

}

const start = (page-1)*limit;
const end = start+limit;

res.json({
products: filtered.slice(start,end),
currentPage: page,
totalPages: Math.ceil(filtered.length/limit)
});

}catch(e){

console.log(e);

res.json({products:[]});

}

});

/* =============================== */

app.listen(PORT,()=>{

console.log("ANAZIA SERVER RUNNING");

});
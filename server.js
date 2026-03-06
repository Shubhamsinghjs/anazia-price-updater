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
 SHOPIFY SAFE FETCH
================================ */

async function shopifyFetch(url, options = {}, retry = 3) {

  try {

    const res = await fetch(url, options);

    if (res.status === 429) {
      console.log("⚠ Shopify rate limit hit... waiting");
      await new Promise(r => setTimeout(r, 800));
      return shopifyFetch(url, options, retry);
    }

    if (!res.ok) {
      throw new Error("Shopify API Error");
    }

    return res;

  } catch (e) {

    if (retry > 0) {
      console.log("Retrying Shopify API...");
      await new Promise(r => setTimeout(r, 1000));
      return shopifyFetch(url, options, retry - 1);
    }

    console.log("API FAILED:", url);
    return null;
  }
}


/* ===============================
 GET ALL PRODUCTS (5000+)
================================ */

async function getAllProducts() {

  let allProducts = [];
  let url = `https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

  while (url) {

    const res = await shopifyFetch(url,{
      headers:{ "X-Shopify-Access-Token":TOKEN }
    });

    if(!res) break;

    const data = await res.json();

    allProducts = allProducts.concat(data.products);

    const link = res.headers.get("link");

    if (link && link.includes('rel="next"')) {

      const match = link.match(/<([^>]+)>; rel="next"/);

      url = match ? match[1] : null;

    } else {

      url = null;

    }

  }

  return allProducts;
}


/* ===============================
 MAIN UI
================================ */

app.get("/", (req,res)=>{

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

.section{display:none;}
.active{display:block;}

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

const page = parseInt(req.query.page)||1;
const q = req.query.q||"";
const limit = 20;

const allProducts = await getAllProducts();

let filtered = allProducts;

if(q){

filtered = allProducts.filter(p =>
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

});


/* ===============================
 UPDATE WHOLE WEBSITE PRICE
================================ */

app.post("/api/set-gold", async (req,res)=>{

GLOBAL_GOLD_RATE = parseFloat(req.body.rate)||0;

let updated = 0;

const products = await getAllProducts();

for(const p of products){

for(const v of p.variants){

try{

const metaRes = await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/variants/${v.id}/metafields.json`,
{ headers:{ "X-Shopify-Access-Token":TOKEN } }
);

if(!metaRes) continue;

const metaData = await metaRes.json();

const config = metaData.metafields.find(m=>m.key==="gold_config");

if(config){

const parsed = JSON.parse(config.value);

const weight = parseFloat(parsed.weight||0);
const diamond = parseFloat(parsed.diamond||0);
const making = parseFloat(parsed.making||0);
const gst = parseFloat(parsed.gst||0);

const goldTotal = GLOBAL_GOLD_RATE * weight;
const subtotal = goldTotal + diamond + making;
const final = subtotal + (subtotal*(gst/100));

await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/variants/${v.id}.json`,
{
method:"PUT",
headers:{
"X-Shopify-Access-Token":TOKEN,
"Content-Type":"application/json"
},
body: JSON.stringify({
variant:{id:v.id,price:final.toFixed(2)}
})
}
);

console.log("Update Variant:", v.id, "| Product:", p.title, "| Price:", final.toFixed(2));

updated++;

}

}catch(e){

console.log("Skip Variant:", v.id);

}

}

}

res.json({updated});

});


app.listen(PORT,()=>console.log("🚀 ANAZIA GOLD ENGINE RUNNING"));
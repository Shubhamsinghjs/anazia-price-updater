require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

let GLOBAL_GOLD_RATE = 0;

/* ===============================
   MAIN UI
================================ */
app.get("/", (req, res) => {
res.send(`
<html>
<head>
<title>ANAZIA GOLD PANEL</title>
<style>

body {
  font-family: 'Segoe UI', Arial, sans-serif;
  background:#f4f6f9;
  padding:30px;
}

h1 {
  font-size:28px;
  margin-bottom:20px;
}

.tabs {
  margin-bottom:20px;
}

.tabs button {
  padding:10px 20px;
  margin-right:10px;
  border:none;
  background:#e0e0e0;
  cursor:pointer;
  border-radius:6px;
  font-weight:600;
}

.tabs button:hover {
  background:#000;
  color:#fff;
}

.section {
  display:none;
}

.active {
  display:block;
}

.card {
  background:#fff;
  padding:20px;
  border-radius:10px;
  box-shadow:0 2px 8px rgba(0,0,0,0.05);
  margin-bottom:20px;
}

input {
  padding:8px;
  border:1px solid #ddd;
  border-radius:6px;
  margin:5px 0;
  min-width:120px;
}

button.primary {
  padding:8px 15px;
  background:#000;
  color:#fff;
  border:none;
  border-radius:6px;
  cursor:pointer;
}

button.primary:hover {
  background:#333;
}

.product {
  border:1px solid #eee;
  padding:15px;
  border-radius:8px;
  margin:10px 0;
  background:#fff;
}

.variant {
  background:#fafafa;
  padding:15px;
  margin-top:10px;
  border-radius:8px;
  border:1px solid #eee;
}

.variant input {
  margin-right:5px;
}

.pagination button {
  padding:6px 12px;
  border:none;
  background:#000;
  color:#fff;
  border-radius:5px;
  margin:5px 5px 0 0;
  cursor:pointer;
}

.pagination button:hover {
  background:#333;
}

.status {
  margin-top:10px;
  font-weight:600;
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
    <h3>Update Gold Rate (Whole Website)</h3>
    <input id="goldRate" placeholder="Enter gold rate">
    <button class="primary" onclick="updateGold()">Update Prices</button>
    <div id="status" class="status"></div>
  </div>
</div>

<div id="products" class="section">

  <div class="card">
    <h3>Search Product</h3>
    <input id="searchInput" placeholder="Search by title">
    <button class="primary" onclick="loadProducts(1)">Search</button>
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
 document.getElementById("status").innerText="Updating... Please wait";

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
    <strong>\${p.title}</strong>
    <button class="primary" onclick="loadVariants(\${p.id})" style="margin-left:10px;">Configure</button>
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
    <b>\${v.title}</b><br><br>

    Weight <input id="weight-\${v.id}">
    Diamond <input id="diamond-\${v.id}">
    Making <input id="making-\${v.id}">
    GST % <input id="gst-\${v.id}">
    <button class="primary" onclick="saveVariant(\${v.id})">Save</button>
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

 alert("Configuration Saved");
}

loadProducts();

</script>

</body>
</html>
`);
});

/* ===============================
   PRODUCTS WITH PAGINATION + SEARCH
================================ */
app.get("/api/products", async (req,res)=>{

 const page = parseInt(req.query.page)||1;
 const q = req.query.q||"";
 const limit = 20;

 const r = await fetch(
  `https://${SHOP}/admin/api/2023-10/products.json?limit=250`,
  { headers:{ "X-Shopify-Access-Token":TOKEN } }
 );

 const data = await r.json();
 let allProducts = data.products || [];

 if(q){
  allProducts = allProducts.filter(p =>
   p.title.toLowerCase().includes(q.toLowerCase())
  );
 }

 const start = (page-1)*limit;
 const end = start+limit;

 res.json({
  products: allProducts.slice(start,end),
  currentPage: page,
  totalPages: Math.ceil(allProducts.length/limit)
 });
});

/* ===============================
   GET VARIANTS
================================ */
app.get("/api/variants/:id", async (req,res)=>{
 const r = await fetch(
  `https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json`,
  { headers:{ "X-Shopify-Access-Token":TOKEN } }
 );
 const data = await r.json();
 res.json(data.product.variants);
});

/* ===============================
   SAVE VARIANT CONFIG
================================ */
app.post("/api/save-variant", async (req,res)=>{

 const {id,weight,diamond,making,gst} = req.body;

 await fetch(
  `https://${SHOP}/admin/api/2023-10/variants/${id}/metafields.json`,
  {
   method:"POST",
   headers:{
    "X-Shopify-Access-Token":TOKEN,
    "Content-Type":"application/json"
   },
   body: JSON.stringify({
    metafield:{
     namespace:"custom",
     key:"gold_config",
     type:"json",
     value: JSON.stringify({weight,diamond,making,gst})
    }
   })
  }
 );

 res.json({success:true});
});

/* ===============================
   UPDATE WHOLE WEBSITE
================================ */
app.post("/api/set-gold", async (req,res)=>{

 GLOBAL_GOLD_RATE = parseFloat(req.body.rate)||0;

 let updated = 0;

 const r = await fetch(
  `https://${SHOP}/admin/api/2023-10/products.json?limit=250`,
  { headers:{ "X-Shopify-Access-Token":TOKEN } }
 );

 const data = await r.json();
 const products = data.products||[];

 for(const p of products){
  for(const v of p.variants){

   const metaRes = await fetch(
    `https://${SHOP}/admin/api/2023-10/variants/${v.id}/metafields.json`,
    { headers:{ "X-Shopify-Access-Token":TOKEN } }
   );

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

    await fetch(
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

    updated++;
   }
  }
 }

 res.json({updated});
});

app.listen(PORT, ()=>console.log("ANAZIA RUNNING"));
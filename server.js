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
   MAIN UI (OLD TAB DESIGN)
================================ */
app.get("/", (req, res) => {
res.send(`
<html>
<head>
<title>ANAZIA GOLD PANEL</title>
<style>
body { font-family: Arial; padding:20px; }
.tabs button { padding:8px 16px; margin-right:5px; cursor:pointer; }
.section { display:none; margin-top:20px; }
.active { display:block; }
.product { border:1px solid #ccc; padding:10px; margin:10px 0; }
.variant { background:#f9f9f9; padding:10px; margin:5px 0; }
input { padding:5px; margin:4px; }
</style>
</head>
<body>

<h1>ANAZIA GOLD – PRICING PANEL</h1>

<div class="tabs">
<button onclick="showTab('pricing')">Pricing Panel</button>
<button onclick="showTab('products')">Products</button>
</div>

<div id="pricing" class="section active">
<h3>Gold Rate ₹/gram</h3>
<input id="goldRate" placeholder="Enter gold rate">
<button onclick="updateGold()">Update Whole Website</button>
<p id="status"></p>
</div>

<div id="products" class="section">
<h3>Search Product</h3>
<input id="searchInput" placeholder="Search by title">
<button onclick="searchProducts()">Search</button>

<div id="productContainer"></div>
</div>

<script>

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

async function searchProducts(){
 const q = document.getElementById("searchInput").value;

 const res = await fetch('/api/search?q='+q);
 const products = await res.json();

 let html = "";

 products.forEach(p=>{
  html += \`
   <div class="product">
    <b>\${p.title}</b>
    <button onclick="loadVariants(\${p.id})">Configure</button>
    <div id="variants-\${p.id}"></div>
   </div>
  \`;
 });

 document.getElementById("productContainer").innerHTML = html;
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
    <button onclick="saveVariant(\${v.id})">Save Config</button>
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

 alert("Saved!");
}

</script>

</body>
</html>
`);
});

/* ===============================
 SEARCH PRODUCTS
================================ */
app.get("/api/search", async (req,res)=>{
 const q = req.query.q || "";

 const r = await fetch(
  `https://${SHOP}/admin/api/2023-10/products.json?limit=250&title=${q}`,
  { headers:{ "X-Shopify-Access-Token":TOKEN } }
 );

 const data = await r.json();
 res.json(data.products || []);
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
 BULK UPDATE ON GOLD CHANGE
================================ */
app.post("/api/set-gold", async (req,res)=>{

 GLOBAL_GOLD_RATE = parseFloat(req.body.rate)||0;

 let updated=0;
 let page=1;
 let hasMore=true;

 while(hasMore){

  const r = await fetch(
   `https://${SHOP}/admin/api/2023-10/products.json?limit=250&page=${page}`,
   { headers:{ "X-Shopify-Access-Token":TOKEN } }
  );

  const data = await r.json();
  const products = data.products || [];

  if(products.length===0){
   hasMore=false;
   break;
  }

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
     const gstAmount = subtotal*(gst/100);
     const final = subtotal + gstAmount;

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

  page++;
 }

 res.json({updated});
});

app.listen(PORT, ()=>console.log("ANAZIA SYSTEM RUNNING"));
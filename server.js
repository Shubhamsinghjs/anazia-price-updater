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

function saveConfig(){
  fs.writeFileSync(DATA_FILE, JSON.stringify(VARIANT_CONFIG,null,2));
}

/* ================= SHOPIFY ================= */

async function shopifyFetch(url,options={}){
  const res = await fetch(url,options);

  if(!res.ok){
    const txt = await res.text();
    console.log("❌ Shopify Error:",txt);
    return null;
  }

  return res;
}

/* ================= PRODUCTS ================= */

let PRODUCT_CACHE = [];

async function getAllProducts(){

  if(PRODUCT_CACHE.length > 0) return PRODUCT_CACHE;

  let products=[];
  let url=`https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

  while(url){

    const res=await shopifyFetch(url,{
      headers:{ "X-Shopify-Access-Token":TOKEN }
    });

    if(!res) break;

    const data=await res.json();
    products=products.concat(data.products);

    const link=res.headers.get("link");

    if(link && link.includes('rel="next"')){
      const match=link.match(/<([^>]+)>; rel="next"/);
      url=match ? match[1] : null;
    }else{
      url=null;
    }
  }

  PRODUCT_CACHE=products;

  console.log("✅ Products Loaded:",products.length);

  return products;
}

/* 🔥 CLEAR CACHE */

app.get("/api/clear-cache",(req,res)=>{
  PRODUCT_CACHE=[];
  console.log("🧹 Cache Cleared");
  res.send("Cache cleared");
});

/* ================= UI SAME ================= */

app.get("/",(req,res)=>{

res.send(`

<html>
<head>

<title>ANAZIA GOLD PANEL</title>

<style>
body{font-family:Arial;background:#f3f5f7;padding:30px;}
h1{margin-bottom:20px;}

.tabs button{
padding:10px 20px;
border:none;
background:#ddd;
margin-right:10px;
cursor:pointer;
border-radius:6px;
}

.tabs button:hover{background:black;color:white;}

.section{display:none;}
.active{display:block;}

.card{
background:white;
padding:20px;
border-radius:10px;
margin-bottom:20px;
box-shadow:0 3px 8px rgba(0,0,0,0.08);
}

.product{
background:white;
padding:15px;
margin-bottom:10px;
border-radius:8px;
}

.variant{
background:#fafafa;
padding:10px;
margin-top:10px;
border-radius:6px;
}

button{
padding:6px 12px;
border:none;
background:black;
color:white;
border-radius:6px;
cursor:pointer;
}

input{
padding:6px;
margin-right:5px;
}
</style>

</head>

<body>

<h1>ANAZIA GOLD PRICING PANEL</h1>

<div class="tabs">
<button onclick="showTab('pricing')">Pricing Panel</button>
<button onclick="showTab('products')">Products</button>
</div>

<div id="pricing" class="section active">

<div class="card">

Gold 12KT ₹/gram
<input id="rate12">

Gold 14KT ₹/gram
<input id="rate14">

<button onclick="updateGold()">Update Whole Website</button>

<p id="status"></p>

</div>

</div>

<div id="products" class="section">

<div class="card">

<input id="searchInput" placeholder="Search product">

<button onclick="loadProducts()">Search</button>

</div>

<div id="productContainer"></div>

</div>

<script>

function showTab(id){
document.getElementById("pricing").classList.remove("active");
document.getElementById("products").classList.remove("active");
document.getElementById(id).classList.add("active");
}

/* 🔥 SEARCH FIX FULL */

async function loadProducts(){

const q=document.getElementById("searchInput").value || "";

const res=await fetch('/api/products?q='+encodeURIComponent(q));
const data=await res.json();

let html="";

if(data.products.length===0){
html="<p>No products found</p>";
}else{

data.products.forEach(p=>{
html+=\`
<div class="product">
<b>\${p.title}</b>
<button onclick="loadVariants(\${p.id})">Configure</button>
<div id="variants-\${p.id}"></div>
</div>\`;
});

}

document.getElementById("productContainer").innerHTML=html;

}

/* VARIANTS */

async function loadVariants(id){

const res=await fetch('/api/variants/'+id);
const variants=await res.json();

let html="";

variants.forEach(v=>{
html+=\`
<div class="variant">
<b>\${v.title}</b><br>

Weight <input id="weight-\${v.id}">
Diamond <input id="diamond-\${v.id}">
Making <input id="making-\${v.id}">
GST <input id="gst-\${v.id}">

<button onclick="saveVariant(\${v.id},'\${v.title}')">Save</button>

</div>\`;
});

document.getElementById("variants-"+id).innerHTML=html;

}

/* SAVE */

async function saveVariant(id,title){

const weight=document.getElementById("weight-"+id).value;
const diamond=document.getElementById("diamond-"+id).value;
const making=document.getElementById("making-"+id).value;
const gst=document.getElementById("gst-"+id).value;

await fetch('/api/save-variant',{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({id,weight,diamond,making,gst,title})
});

alert("Saved");

}

/* UPDATE */

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

loadProducts();

</script>

</body>
</html>

`);

});

/* ================= API ================= */

app.get("/api/products",async(req,res)=>{

const q=(req.query.q||"").toLowerCase();

const products=await getAllProducts();

const filtered = q
  ? products.filter(p => p.title.toLowerCase().includes(q))
  : products;

res.json({products:filtered});

});

/* बाकी API same रखो */

app.get("/api/variants/:id",async(req,res)=>{
const r=await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json`,
{headers:{"X-Shopify-Access-Token":TOKEN}}
);
if(!r) return res.json([]);
const data=await r.json();
res.json(data.product.variants);
});

app.post("/api/save-variant",(req,res)=>{
const {id,weight,diamond,making,gst,title}=req.body;
const kt=title.toUpperCase().includes("12KT")?"12KT":"14KT";
VARIANT_CONFIG[id]={weight,diamond,making,gst,kt,title};
saveConfig();
console.log("✅ SAVED:",id,kt);
res.json({success:true});
});

app.post("/api/set-gold",async(req,res)=>{
const rate12=parseFloat(req.body.rate12)||0;
const rate14=parseFloat(req.body.rate14)||0;

let updated=0;

for(const id in VARIANT_CONFIG){

const v=VARIANT_CONFIG[id];

const rate=v.kt==="12KT"?rate12:rate14;

const gold=rate*(v.weight||0);
const subtotal=gold+(+v.diamond||0)+(+v.making||0);
const final=subtotal+(subtotal*((+v.gst||0)/100));

const price=final.toFixed(2);

await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/variants/${id}.json`,
{
method:"PUT",
headers:{
"X-Shopify-Access-Token":TOKEN,
"Content-Type":"application/json"
},
body:JSON.stringify({variant:{id,price}})
}
);

updated++;
await new Promise(r=>setTimeout(r,300));

}

res.json({updated});
});

/* SERVER */

app.listen(PORT,()=>{
console.log("🚀 SERVER RUNNING");
});
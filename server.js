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

function saveConfig(){
fs.writeFileSync(DATA_FILE, JSON.stringify(VARIANT_CONFIG,null,2));
}

/* =========================
SHOPIFY SAFE FETCH
========================= */

async function shopifyFetch(url,options={}){

const res = await fetch(url,options);

if(!res.ok){

const txt = await res.text();
console.log("Shopify Error:",txt);
return null;

}

return res;

}

/* =========================
LOAD PRODUCTS (3000 SUPPORT)
========================= */

let PRODUCT_CACHE=[];

async function getAllProducts(){

if(PRODUCT_CACHE.length>0) return PRODUCT_CACHE;

let products=[];
let url=`https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

while(url){

const res=await shopifyFetch(url,{
headers:{
"X-Shopify-Access-Token":TOKEN
}
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

console.log("Products Loaded:",products.length);

return products;

}

/* =========================
UI PANEL
========================= */

app.get("/",(req,res)=>{

res.send(`
<html>

<head>

<title>ANAZIA GOLD PANEL</title>

<style>

body{
font-family:Arial;
background:#f3f5f7;
padding:30px;
}

h1{
margin-bottom:20px;
}

.tabs button{
padding:10px 20px;
border:none;
background:#ddd;
margin-right:10px;
cursor:pointer;
border-radius:6px;
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

Gold Rate ₹/gram

<input id="goldRate">

<button onclick="updateGold()">
Update Whole Website
</button>

<p id="status"></p>

</div>

</div>

<div id="products" class="section">

<div class="card">

<input id="searchInput" placeholder="Search product">

<button onclick="loadProducts(1)">
Search
</button>

</div>

<div id="productContainer"></div>

</div>

<script>

let currentPage=1;

function showTab(id){

document.getElementById("pricing").classList.remove("active");
document.getElementById("products").classList.remove("active");

document.getElementById(id).classList.add("active");

}

/* ===================
UPDATE GOLD RATE
=================== */

async function updateGold(){

const rate=document.getElementById("goldRate").value;

document.getElementById("status").innerText="Updating...";

const res=await fetch('/api/set-gold',{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({rate})
});

const data=await res.json();

document.getElementById("status").innerText="Updated "+data.updated+" variants";

}

/* ===================
LOAD PRODUCTS
=================== */

async function loadProducts(page=1){

currentPage=page;

const q=document.getElementById("searchInput").value;

const res=await fetch('/api/products?page='+page+'&q='+q);

const data=await res.json();

let html="";

data.products.forEach(p=>{

html+=\`

<div class="product">

<b>\${p.title}</b>

<button onclick="loadVariants(\${p.id})">
Configure
</button>

<div id="variants-\${p.id}"></div>

</div>

\`;

});

document.getElementById("productContainer").innerHTML=html;

}

/* ===================
LOAD VARIANTS
=================== */

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

<button onclick="saveVariant(\${v.id})">
Save
</button>

</div>

\`;

});

document.getElementById("variants-"+id).innerHTML=html;

}

/* ===================
SAVE CONFIG
=================== */

async function saveVariant(id){

const weight=document.getElementById("weight-"+id).value;
const diamond=document.getElementById("diamond-"+id).value;
const making=document.getElementById("making-"+id).value;
const gst=document.getElementById("gst-"+id).value;

await fetch('/api/save-variant',{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({id,weight,diamond,making,gst})
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
PRODUCT API
========================= */

app.get("/api/products",async(req,res)=>{

const page=parseInt(req.query.page)||1;

const limit=20;

const q=req.query.q||"";

const products=await getAllProducts();

let filtered=products;

if(q){

filtered=products.filter(p=>p.title.toLowerCase().includes(q.toLowerCase()));

}

const start=(page-1)*limit;
const end=start+limit;

res.json({
products:filtered.slice(start,end)
});

});

/* =========================
VARIANTS
========================= */

app.get("/api/variants/:id",async(req,res)=>{

const r=await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json`,
{
headers:{
"X-Shopify-Access-Token":TOKEN
}
}
);

if(!r) return res.json([]);

const data=await r.json();

res.json(data.product.variants);

});

/* =========================
SAVE VARIANT
========================= */

app.post("/api/save-variant",(req,res)=>{

const {id,weight,diamond,making,gst}=req.body;

VARIANT_CONFIG[id]={weight,diamond,making,gst};

saveConfig();

res.json({success:true});

});

/* =========================
UPDATE PRICE (SAFE DELAY)
========================= */

app.post("/api/set-gold",async(req,res)=>{

const rate=parseFloat(req.body.rate)||0;

let updated=0;

for(const id in VARIANT_CONFIG){

const conf=VARIANT_CONFIG[id];

const weight=parseFloat(conf.weight||0);
const diamond=parseFloat(conf.diamond||0);
const making=parseFloat(conf.making||0);
const gst=parseFloat(conf.gst||0);

const gold=rate*weight;

const subtotal=gold+diamond+making;

const final=subtotal+(subtotal*(gst/100));

const price=parseFloat(final).toFixed(2);

await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/variants/${id}.json`,
{
method:"PUT",
headers:{
"X-Shopify-Access-Token":TOKEN,
"Content-Type":"application/json"
},
body:JSON.stringify({
variant:{id:id,price:price}
})
}
);

updated++;

console.log("Updated:",id,price);

/* SAFE API LIMIT */
await new Promise(r=>setTimeout(r,1200));

}

res.json({updated});

});

/* =========================
SERVER
========================= */

app.listen(PORT,()=>{

console.log("ANAZIA SERVER RUNNING");

});
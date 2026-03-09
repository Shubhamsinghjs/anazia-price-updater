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

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

/* ===============================
SAFE FETCH
================================ */

async function shopifyFetch(url,options={},retry=3){

const res = await fetch(url,options);

if(res.status==429){

console.log("Rate limit... waiting");

await sleep(1000);

if(retry>0) return shopifyFetch(url,options,retry-1);

}

if(!res.ok){

const txt = await res.text();

console.log("Shopify Error:",txt);

throw new Error("Shopify API Error");

}

return res;

}

/* ===============================
GET PRODUCTS
================================ */

let PRODUCT_CACHE=[];

async function getAllProducts(){

if(PRODUCT_CACHE.length>0) return PRODUCT_CACHE;

let products=[];

let url=`https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

while(url){

const res = await shopifyFetch(url,{
headers:{
"X-Shopify-Access-Token":TOKEN
}
});

const data = await res.json();

products = products.concat(data.products);

const link = res.headers.get("link");

if(link && link.includes('rel="next"')){

const match = link.match(/<([^>]+)>; rel="next"/);

url = match ? match[1] : null;

}else{

url=null;

}

}

PRODUCT_CACHE = products;

console.log("Products fetched:",products.length);

return products;

}

/* ===============================
UI
================================ */

app.get("/",(req,res)=>{

res.send(`APP RUNNING`);

});

/* ===============================
PRODUCT LIST
================================ */

app.get("/api/products",async(req,res)=>{

const q = req.query.q || "";

const products = await getAllProducts();

let filtered = products;

if(q){
filtered = products.filter(p=>p.title.toLowerCase().includes(q.toLowerCase()));
}

res.json({products:filtered});

});

/* ===============================
VARIANTS
================================ */

app.get("/api/variants/:id",async(req,res)=>{

const r = await shopifyFetch(
`https://${SHOP}/admin/api/2023-10/products/${req.params.id}.json`,
{
headers:{ "X-Shopify-Access-Token":TOKEN }
}
);

const data = await r.json();

res.json(data.product.variants);

});

/* ===============================
SAVE VARIANT CONFIG
================================ */

app.post("/api/save-variant",(req,res)=>{

const {id,weight,diamond,making,gst} = req.body;

VARIANT_CONFIG[id]={weight,diamond,making,gst};

fs.writeFileSync(DATA_FILE,JSON.stringify(VARIANT_CONFIG,null,2));

res.json({success:true});

});

/* ===============================
BULK PRICE UPDATE
================================ */

app.post("/api/set-gold",async(req,res)=>{

const rate = parseFloat(req.body.rate)||0;

let updated=0;

for(const id in VARIANT_CONFIG){

const conf = VARIANT_CONFIG[id];

const weight = parseFloat(conf.weight||0);
const diamond = parseFloat(conf.diamond||0);
const making = parseFloat(conf.making||0);
const gst = parseFloat(conf.gst||0);

const gold = rate * weight;

const subtotal = gold + diamond + making;

const final = subtotal + (subtotal*(gst/100));

await shopifyFetch(

`https://${SHOP}/admin/api/2023-10/variants/${id}.json`,

{
method:"PUT",
headers:{
"X-Shopify-Access-Token":TOKEN,
"Content-Type":"application/json"
},
body: JSON.stringify({
variant:{id:id,price:final.toFixed(2)}
})
}

);

console.log("Updated Variant:",id,"Price:",final);

updated++;

await sleep(400);

}

res.json({updated});

});

app.listen(PORT,()=>{

console.log("ANAZIA SERVER RUNNING");

});
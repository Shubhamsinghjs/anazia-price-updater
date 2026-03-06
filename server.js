require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

if (!SHOP || !TOKEN) {
  console.log("Missing ENV variables");
  process.exit(1);
}

let GLOBAL_GOLD_RATE = 0;


/* ===============================
 SAFE DELAY
================================ */

function delay(ms){
  return new Promise(r=>setTimeout(r,ms));
}


/* ===============================
 SAFE SHOPIFY FETCH
================================ */

async function shopifyFetch(url, options = {}, retry = 5){

  try{

    const res = await fetch(url,options);

    if(res.status === 429){

      console.log("Rate limit hit... waiting");

      await delay(1500);

      return shopifyFetch(url,options,retry);

    }

    if(!res.ok){

      throw new Error("Shopify API Error");

    }

    await delay(600);

    return res;

  }catch(err){

    if(retry > 0){

      console.log("Retrying Shopify API...");

      await delay(2000);

      return shopifyFetch(url,options,retry-1);

    }

    console.log("API FAILED:",url);

    return null;

  }

}


/* ===============================
 GET ALL PRODUCTS (5000 SUPPORT)
================================ */

async function getAllProducts(){

  let products = [];

  let url = `https://${SHOP}/admin/api/2023-10/products.json?limit=250`;

  while(url){

    const res = await shopifyFetch(url,{
      headers:{ "X-Shopify-Access-Token":TOKEN }
    });

    if(!res) break;

    const data = await res.json();

    products = products.concat(data.products);

    const link = res.headers.get("link");

    if(link && link.includes('rel="next"')){

      const match = link.match(/<([^>]+)>; rel="next"/);

      url = match ? match[1] : null;

    }else{

      url = null;

    }

  }

  return products;

}


/* ===============================
 MAIN PAGE
================================ */

app.get("/",(req,res)=>{

res.send(`
<h2>ANAZIA GOLD ENGINE RUNNING</h2>
<p>Use Shopify app panel to operate.</p>
`);

});


/* ===============================
 UPDATE GOLD PRICE
================================ */

app.post("/api/set-gold", async (req,res)=>{

  GLOBAL_GOLD_RATE = parseFloat(req.body.rate) || 0;

  let updated = 0;

  const products = await getAllProducts();

  console.log("Total Products:",products.length);

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

        if(!config) continue;

        const parsed = JSON.parse(config.value);

        const weight = parseFloat(parsed.weight || 0);
        const diamond = parseFloat(parsed.diamond || 0);
        const making = parseFloat(parsed.making || 0);
        const gst = parseFloat(parsed.gst || 0);

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
            body:JSON.stringify({
              variant:{ id:v.id, price:final.toFixed(2) }
            })
          }
        );

        console.log(
          "Update Variant:",
          v.id,
          "| Product:",
          p.title,
          "| Price:",
          final.toFixed(2)
        );

        updated++;

      }catch(e){

        console.log("Skip Variant:",v.id);

      }

    }

  }

  res.json({updated});

});


app.listen(PORT,()=>{

console.log("🚀 ANAZIA GOLD ENGINE RUNNING");

});
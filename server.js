app.post("/api/set-gold", async (req, res) => {

const rate12 = parseFloat(req.body.rate12) || 0;
const rate14 = parseFloat(req.body.rate14) || 0;

let updated = 0;

for (const id in VARIANT_CONFIG) {

  const conf = VARIANT_CONFIG[id];

  const weight = parseFloat(conf.weight || 0);
  const diamond = parseFloat(conf.diamond || 0);
  const making = parseFloat(conf.making || 0);
  const gst = parseFloat(conf.gst || 0);
  const kt = conf.kt || "14KT";

  let rate = rate14;

  if (kt === "12KT") rate = rate12;
  if (kt === "14KT") rate = rate14;

  const gold = rate * weight;
  const subtotal = gold + diamond + making;
  const final = subtotal + (subtotal * (gst / 100));

  const price = parseFloat(final).toFixed(2);

  await shopifyFetch(
    `https://${SHOP}/admin/api/2023-10/variants/${id}.json`,
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

  updated++;

  console.log("UPDATED VARIANT:", {
    variant_id: id,
    kt: kt,
    price: price
  });

  await new Promise(r => setTimeout(r, 1200));
}

res.json({ updated });

});
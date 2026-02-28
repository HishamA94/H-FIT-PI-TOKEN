exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try{
    const { paymentId, txid } = JSON.parse(event.body || "{}");
    if (!paymentId || !txid) return { statusCode: 400, body: JSON.stringify({ error: "Missing paymentId/txid" }) };

    const PI_API_KEY = process.env.PI_API_KEY;
    if (!PI_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: "Missing PI_API_KEY env" }) };

    const res = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${PI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ txid })
    });

    const text = await res.text();
    let data; try{ data = JSON.parse(text); }catch{ data = { raw: text }; }

    if (!res.ok) return { statusCode: res.status, body: JSON.stringify({ error: "complete_failed", details: data }) };

    return { statusCode: 200, body: JSON.stringify({ ok: true, data }) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
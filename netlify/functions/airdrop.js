const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };
  
  try {
    const adminToken = event.headers["x-admin-token"];
    if (adminToken !== process.env.ADMIN_TOKEN) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "غير مصرح لك (باسورد خاطئ)." }) };
    }
    
    const { assetCode, addresses, amount } = JSON.parse(event.body || "{}");
    const DISTRIBUTOR_SECRET = process.env.DISTRIBUTOR_SECRET;
    const ISSUER_SECRET = process.env.ISSUER_SECRET;
    
    if (!DISTRIBUTOR_SECRET || !ISSUER_SECRET) throw new Error("مفاتيح المحافظ غير متوفرة في السيرفر.");
    if (!addresses || addresses.length === 0) throw new Error("لا توجد محافظ للإرسال إليها.");
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    const distKP = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET);
    const issuerKP = StellarSdk.Keypair.fromSecret(ISSUER_SECRET);
    const token = new StellarSdk.Asset(assetCode, issuerKP.publicKey());
    
    const distAccount = await server.loadAccount(distKP.publicKey());
    let txBuilder = new StellarSdk.TransactionBuilder(distAccount, {
      fee: await server.fetchBaseFee(),
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    
    // إضافة عملية تحويل لكل محفظة في القائمة (بحد أقصى 100)
    const maxOps = Math.min(addresses.length, 100);
    for (let i = 0; i < maxOps; i++) {
      const destAddress = addresses[i].trim();
      if (destAddress && destAddress.length >= 50) {
        txBuilder.addOperation(StellarSdk.Operation.payment({
          destination: destAddress,
          asset: token,
          amount: String(amount)
        }));
      }
    }
    
    const tx = txBuilder.setTimeout(180).build();
    tx.sign(distKP);
    const res = await server.submitTransaction(tx);
    
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, hash: res.hash, count: maxOps }) };
  } catch (e) {
    console.error("Airdrop Error:", e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || "فشل التوزيع." }) };
  }
};
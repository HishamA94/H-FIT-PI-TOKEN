const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

function requireAdmin(event) {
  const need = process.env.ADMIN_TOKEN;
  if (!need) return; // لو مش عايز حماية، سيبه فاضي (مش مفضل)
  const got = event.headers["x-admin-token"] || event.headers["X-Admin-Token"];
  if (got !== need) throw new Error("Unauthorized (bad admin token)");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  
  try {
    requireAdmin(event);
    
    const { assetCode, initialSupply } = JSON.parse(event.body || "{}");
    if (!assetCode || !initialSupply) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing assetCode/initialSupply" }) };
    }
    
    const ISSUER_SECRET = process.env.ISSUER_SECRET;
    const DISTRIBUTOR_SECRET = process.env.DISTRIBUTOR_SECRET;
    if (!ISSUER_SECRET || !DISTRIBUTOR_SECRET) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing ISSUER_SECRET/DISTRIBUTOR_SECRET env" }) };
    }
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    
    const issuerKP = StellarSdk.Keypair.fromSecret(ISSUER_SECRET);
    const distKP = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET);
    
    const asset = new StellarSdk.Asset(assetCode, issuerKP.publicKey());
    
    // 1) Distributor changeTrust
    const distAccount = await server.loadAccount(distKP.publicKey());
    const trustTx = new StellarSdk.TransactionBuilder(distAccount, {
        fee: await server.fetchBaseFee(),
        networkPassphrase: NETWORK_PASSPHRASE,
      })
      .addOperation(StellarSdk.Operation.changeTrust({ asset }))
      .setTimeout(180)
      .build();
    
    trustTx.sign(distKP);
    const trustRes = await server.submitTransaction(trustTx);
    
    // 2) Issuer payment initial supply -> Distributor
    const issuerAccount = await server.loadAccount(issuerKP.publicKey());
    const payTx = new StellarSdk.TransactionBuilder(issuerAccount, {
        fee: await server.fetchBaseFee(),
        networkPassphrase: NETWORK_PASSPHRASE,
      })
      .addOperation(StellarSdk.Operation.payment({
        destination: distKP.publicKey(),
        asset,
        amount: String(initialSupply),
      }))
      .setTimeout(180)
      .build();
    
    payTx.sign(issuerKP);
    const payRes = await server.submitTransaction(payTx);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        asset: { code: assetCode, issuer: issuerKP.publicKey() },
        distributor: distKP.publicKey(),
        trust: { hash: trustRes.hash },
        issue: { hash: payRes.hash }
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
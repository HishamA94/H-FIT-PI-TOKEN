// مسار الملف: netlify/functions/set_domain.js

const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

// دالة التحقق من باسورد الأدمن
function requireAdmin(event) {
  const need = process.env.ADMIN_TOKEN;
  if (!need) return;
  const got = event.headers["x-admin-token"] || event.headers["X-Admin-Token"];
  if (got !== need) throw new Error("Unauthorized (bad admin token)");
}

exports.handler = async (event) => {
  // التأكد إن الطلب من نوع POST
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  
  try {
    // التحقق من الحماية (باسورد الأدمن)
    requireAdmin(event);
    
    // استلام البيانات من الفرونت إند
    const { domain } = JSON.parse(event.body || "{}");
    if (!domain) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing domain (لم يتم إرسال الدومين)" }) };
    }
    
    // جلب المفتاح السري الخاص بحساب المُصدر (Issuer) من إعدادات Netlify
    const ISSUER_SECRET = process.env.ISSUER_SECRET;
    if (!ISSUER_SECRET) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing ISSUER_SECRET env (المفتاح السري للمُصدر مفقود)" }) };
    }
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    const issuerKP = StellarSdk.Keypair.fromSecret(ISSUER_SECRET);
    
    // جلب تفاصيل حساب المُصدر من البلوكتشين
    const issuerAccount = await server.loadAccount(issuerKP.publicKey());
    
    // بناء المعاملة (Transaction) لتعيين الدومين
    const tx = new StellarSdk.TransactionBuilder(issuerAccount, {
        fee: await server.fetchBaseFee(),
        networkPassphrase: NETWORK_PASSPHRASE,
      })
      .addOperation(StellarSdk.Operation.setOptions({
        homeDomain: domain // هنا بيتم ربط الدومين بالحساب
      }))
      .setTimeout(180)
      .build();
    
    // توقيع المعاملة بالمفتاح السري للمُصدر
    tx.sign(issuerKP);
    
    // إرسال المعاملة إلى شبكة Pi
    const res = await server.submitTransaction(tx);
    
    // إرجاع رد ناجح للفرونت إند
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        domain: domain,
        issuer: issuerKP.publicKey(),
        hash: res.hash,
        message: "تم تعيين الدومين بنجاح كـ home_domain لحساب المُصدر."
      })
    };
  } catch (e) {
    console.error("Set Domain Error:", e);
    // استخراج تفاصيل الخطأ من البلوكتشين (إن وجدت)
    const errorDetails = e.response && e.response.data ? e.response.data : e.message || String(e);
    return { statusCode: 500, body: JSON.stringify({ error: errorDetails }) };
  }
};

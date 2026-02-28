// مسار الملف: netlify/functions/withdraw_token.js

const StellarSdk = require("stellar-sdk");

const HORIZON = "https://api.testnet.minepi.com";
const NETWORK_PASSPHRASE = "Pi Testnet";

exports.handler = async (event) => {
  // التأكد من أن الطلب من نوع POST
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  
  try {
    // استلام عنوان محفظة المستخدم والكمية المراد سحبها من الفرونت إند
    const { destinationWallet, amount } = JSON.parse(event.body || "{}");
    
    if (!destinationWallet || !amount) {
      return { statusCode: 400, body: JSON.stringify({ error: "يجب إرسال عنوان المحفظة والكمية." }) };
    }
    
    // جلب المفاتيح من إعدادات Netlify المتاحة لديك
    const DISTRIBUTOR_SECRET = process.env.DISTRIBUTOR_SECRET;
    const ISSUER_SECRET = process.env.ISSUER_SECRET;
    const ASSET_CODE = "DONATE";
    
    if (!DISTRIBUTOR_SECRET || !ISSUER_SECRET) {
      return { statusCode: 500, body: JSON.stringify({ error: "المفاتيح (ISSUER_SECRET أو DISTRIBUTOR_SECRET) غير متوفرة في Netlify." }) };
    }
    
    const server = new StellarSdk.Horizon.Server(HORIZON);
    
    // استخراج بيانات حساب الموزع (المرسل)
    const distKP = StellarSdk.Keypair.fromSecret(DISTRIBUTOR_SECRET);
    
    // استخراج المفتاح العام للمُصدر تلقائياً من المفتاح السري
    const issuerKP = StellarSdk.Keypair.fromSecret(ISSUER_SECRET);
    const issuerPublicKey = issuerKP.publicKey();
    
    // تعريف العملة المراد إرسالها باستخدام المفتاح العام المستنتج
    const token = new StellarSdk.Asset(ASSET_CODE, issuerPublicKey);
    
    // جلب بيانات حساب الموزع من البلوكتشين لمعرفة رقم العملية (Sequence)
    const distAccount = await server.loadAccount(distKP.publicKey());
    
    // بناء المعاملة (إرسال Payment من الموزع إلى المستخدم)
    const tx = new StellarSdk.TransactionBuilder(distAccount, {
        fee: await server.fetchBaseFee(),
        networkPassphrase: NETWORK_PASSPHRASE,
      })
      .addOperation(StellarSdk.Operation.payment({
        destination: destinationWallet,
        asset: token,
        amount: String(amount),
      }))
      .setTimeout(180)
      .build();
    
    // توقيع المعاملة بالمفتاح السري للموزع
    tx.sign(distKP);
    
    // إرسال المعاملة إلى شبكة Pi
    const res = await server.submitTransaction(tx);
    
    // إرجاع رد ناجح للواجهة لتأكيد عملية السحب
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        hash: res.hash,
        message: "تم إرسال العملات بنجاح للمستخدم."
      })
    };
  } catch (e) {
    console.error("Withdraw Error:", e);
    
    let errorMessage = e.message || String(e);
    
    // التقاط خطأ "عدم وجود خط ثقة" وتوضيحه للمستخدم
    if (e.response && e.response.data && e.response.data.extras) {
      const resultCodes = e.response.data.extras.result_codes;
      if (resultCodes && resultCodes.operations && resultCodes.operations.includes("op_no_trust")) {
        errorMessage = "op_no_trust";
      } else {
        errorMessage = JSON.stringify(e.response.data.extras.result_codes);
      }
    }
    
    return { statusCode: 500, body: JSON.stringify({ error: errorMessage }) };
  }
};
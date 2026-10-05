import { Router } from "express";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { COIN_PACKAGES, MIN_WITHDRAWAL_USD, creditPurchasedCoins, ensureWallet, recordPurchasedCoinRefund } from "../money/wallet.js";
import { giftCatalogForCountry, GIFT_CATALOG, sendGift } from "../money/gifts.js";
import { createWithdrawal, processGhanaWithdrawal, processFlutterwaveWithdrawal, reconcilePaystackTransfer, reconcileFlutterwaveTransfer, refreshFlutterwaveWithdrawal } from "../money/withdrawal.js";
import { initializeCoinPurchase, verifyPaystackTransaction, verifyPaystackWebhookSignature } from "../money/providers/paystack.js";
import { listGhanaPayoutBanks } from "../money/providers/paystack.js";
import { initializeFlutterwaveCheckout, verifyFlutterwaveTransaction, verifyFlutterwaveWebhookSignature, listFlutterwaveBanks } from "../money/providers/flutterwave.js";
import { currencyForCountry, exchangeRateEnvName, resolveCollectionProvider, resolvePayoutProvider, payoutProviders } from "../money/providers/routing.js";
import { requireUser, requireAdultUser } from "../auth/middleware.js";
import { broadcastToUser } from "../realtime/ws.js";
import { rateLimit } from "../security/rate-limit.js";
import { rateLimit as expressRateLimit, ipKeyGenerator } from "express-rate-limit";

export const walletRouter = Router();


const monetizationWriteLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: req => req.userId?.toHexString() ?? req.ip ?? "unknown" });

walletRouter.get("/monetization", requireUser, async (req, res) => {
  try {
    const user = await (await getDb()).collection("users").findOne(
      { _id: req.userId! },
      { projection: { monetizationEnabled: 1, monetizationEnabledAt: 1, monetizationTermsVersion: 1, dateOfBirth: 1 } }
    );
    const dob = user?.dateOfBirth ? new Date(user.dateOfBirth) : null;
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 18);
    return res.json({
      monetizationEnabled: user?.monetizationEnabled === true,
      enabledAt: user?.monetizationEnabledAt ?? null,
      termsVersion: user?.monetizationTermsVersion ?? null,
      adultEligible: Boolean(dob && !Number.isNaN(dob.getTime()) && dob <= cutoff)
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Monetization settings lookup failed" });
  }
});

walletRouter.patch("/monetization", requireAdultUser, monetizationWriteLimit, async (req, res) => {
  try {
    const enabled = req.body?.enabled === true;
    const termsVersion = String(req.body?.termsVersion ?? "").trim();
    if (enabled && !termsVersion) return res.status(400).json({ error: "You must accept the current monetization terms before turning Monetization on." });
    const db = await getDb();
    const now = new Date();
    const update = enabled
      ? { $set: { monetizationEnabled: true, monetizationEnabledAt: now, monetizationTermsVersion: termsVersion, updatedAt: now } }
      : { $set: { monetizationEnabled: false, updatedAt: now } };
    await db.collection("users").updateOne({ _id: req.userId! }, update);
    return res.json({ monetizationEnabled: enabled, enabledAt: enabled ? now : null, termsVersion: enabled ? termsVersion : null });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to update monetization settings" });
  }
});


walletRouter.get("/revenuecat/config", requireUser, async (req, res) => {
  return res.json({ appUserId: req.userId!.toHexString() });
});

walletRouter.get("/catalog", requireAdultUser, async (req, res) => {
  const user = await (await getDb()).collection("users").findOne({ _id: req.userId! }, { projection: { countryCode: 1 } });
  const countryCode = String(user?.countryCode ?? "");
  const { collectionProviders, currencyForCountry } = await import("../money/providers/routing.js");
  return res.json({
    coinPackages: COIN_PACKAGES,
    gifts: giftCatalogForCountry(countryCode),
    collectionProviders: collectionProviders(countryCode),
    collectionCurrency: currencyForCountry(countryCode),
    pricingRegion: giftCatalogForCountry(countryCode).some((g) => g.coins !== g.baseCoins) ? "NON_AFRICA" : "AFRICA",
    nonAfricanGiftMultiplier: 1.5,
    creatorSharePercent: 30, platformSharePercent: 70,
    diamondsPerCoin: 0.30, minWithdrawalUsd: MIN_WITHDRAWAL_USD, accountingModel: "NET_PROCEEDS_70_30"
  });
});

walletRouter.get("/me", requireUser, async (req, res) => {
  try { return res.json(await ensureWallet(await getDb(), req.userId!.toHexString())); }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Wallet lookup failed" }); }
});

walletRouter.get("/me/ledger", requireUser, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await (await getDb()).collection("wallet_ledger").find({ userId: req.userId!.toHexString() }).sort({ createdAt: -1 }).limit(limit).toArray();
    return res.json({ transactions: rows });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Ledger lookup failed" }); }
});


walletRouter.get("/me/earnings", requireUser, expressRateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.userId?.toHexString() ?? ipKeyGenerator(req.ip ?? "unknown") }), async (req, res) => {
  try {
    const db = await getDb();
    const now = new Date();
    const rawDays = Number(req.query.days ?? 30);
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const userId = req.userId!.toHexString();

    const [summaryRows, gifts, withdrawals, wallet] = await Promise.all([
      db.collection("gift_transactions").aggregate([
        { $match: { receiverId: userId, createdAt: { $gte: from, $lt: now } } },
        { $group: {
          _id: null,
          giftsReceived: { $sum: 1 },
          diamonds: { $sum: "$diamondsAwarded" },
          grossCreatorEarningsUsd: { $sum: "$creatorEarningsUsd" },
          cashCreditedUsd: { $sum: "$creatorCashCreditUsd" },
          liabilityOffsetUsd: { $sum: "$creatorLiabilityOffsetUsd" }
        } }
      ]).toArray(),
      db.collection("gift_transactions").find(
        { receiverId: userId, createdAt: { $gte: from, $lt: now } },
        { projection: { _id: 0, transactionId: 1, giftId: 1, giftName: 1, quantity: 1, coinsSpent: 1, diamondsAwarded: 1, creatorEarningsUsd: 1, creatorCashCreditUsd: 1, creatorLiabilityOffsetUsd: 1, context: 1, videoId: 1, createdAt: 1 } }
      ).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("withdrawals").find(
        { userId, createdAt: { $gte: from, $lt: now } },
        { projection: { _id: 0, amountUsd: 1, status: 1, provider: 1, createdAt: 1, completedAt: 1 } }
      ).sort({ createdAt: -1 }).limit(100).toArray(),
      ensureWallet(db, userId)
    ]);

    const summary = summaryRows[0] ?? {};
    if (!wallet) return res.status(500).json({ error: "Wallet lookup failed" });
    const withdrawalTotals = withdrawals.reduce((acc, row) => {
      const status = String(row.status ?? "UNKNOWN").toUpperCase();
      const amount = Number(row.amountUsd ?? 0);
      acc.count += 1;
      if (status === "PAID") acc.paidUsd += amount;
      else if (status === "PENDING" || status === "PROCESSING") acc.pendingUsd += amount;
      else if (status === "FAILED" || status === "REVERSED") acc.failedUsd += amount;
      return acc;
    }, { count: 0, paidUsd: 0, pendingUsd: 0, failedUsd: 0 });

    return res.json({
      period: { days, from: from.toISOString(), to: now.toISOString() },
      summary: {
        giftsReceived: Number(summary.giftsReceived ?? 0),
        diamonds: Number(summary.diamonds ?? 0),
        grossCreatorEarningsUsd: Number(summary.grossCreatorEarningsUsd ?? 0),
        cashCreditedUsd: Number(summary.cashCreditedUsd ?? 0),
        liabilityOffsetUsd: Number(summary.liabilityOffsetUsd ?? 0),
        currentCashBalanceUsd: Number(wallet.cashBalanceUsd ?? 0),
        creatorRefundLiabilityUsd: Number(wallet.creatorRefundLiabilityUsd ?? 0)
      },
      withdrawals: { ...withdrawalTotals, recent: withdrawals },
      gifts
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Earnings analytics lookup failed" });
  }
});

walletRouter.get("/me/gifts", requireUser, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await (await getDb()).collection("gift_transactions").find({ receiverId: req.userId!.toHexString() }).sort({ createdAt: -1 }).limit(limit).toArray();
    return res.json({ gifts: rows });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Gift history lookup failed" }); }
});

walletRouter.get("/me/withdrawals", requireUser, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await (await getDb()).collection("withdrawals").find({ userId: req.userId!.toHexString() }).sort({ createdAt: -1 }).limit(limit).project({ destination: 0 }).toArray();
    return res.json({ withdrawals: rows });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Withdrawal history lookup failed" }); }
});

;

walletRouter.post("/coins/paystack/initialize", requireAdultUser, async (req, res) => {
  try {
    const sku = String(req.body?.sku ?? "");
    const pkg = COIN_PACKAGES.find((item) => item.sku === sku);
    if (!pkg) return res.status(400).json({ error: "Invalid Coin package" });
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { email: 1, dateOfBirth: 1 } });
    if (!user?.email) return res.status(400).json({ error: "An email address is required for Coin purchases" });
    if (user.dateOfBirth) {
      const dob = new Date(user.dateOfBirth);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 18);
      if (dob > cutoff) return res.status(403).json({ error: "Coin purchases require an adult account" });
    }
    const rate = Number(process.env.TWITOK_USD_GHS_RATE);
    if (!Number.isFinite(rate) || rate <= 0) return res.status(503).json({ error: "GHS payment exchange rate is not configured" });
    const amountGhs = Number((pkg.priceUsd * rate).toFixed(2));
    const reference = "TWITOK-" + randomUUID().replaceAll("-", "").slice(0, 24);
    const callbackUrl = process.env.TWITOK_PAYSTACK_CALLBACK_URL;
    const result = await initializeCoinPurchase({ email: user.email, amountGhs, reference, userId: req.userId!.toHexString(), sku: pkg.sku, coins: pkg.coins, callbackUrl });
    await db.collection("coin_purchases").insertOne({ reference, userId: req.userId!.toHexString(), sku: pkg.sku, coins: pkg.coins, priceUsd: pkg.priceUsd, amountGhs, status: "INITIALIZED", provider: "PAYSTACK", createdAt: new Date() });
    return res.status(201).json({ reference, authorizationUrl: result.authorization_url, accessCode: result.access_code, amountGhs, currency: "GHS", coins: pkg.coins });
  } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : "Coin purchase initialization failed" }); }
});

walletRouter.post("/iap/revenuecat/webhook", async (req, res) => {
  try {
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!expected || req.header("Authorization") !== expected) return res.status(401).json({ error: "Unauthorized" });

    const event = req.body?.event ?? req.body;
    const eventId = String(event?.id ?? "").trim();
    const eventType = String(event?.type ?? "").trim().toUpperCase();
    const userId = String(event?.app_user_id ?? "").trim();
    const transactionId = String(event?.transaction_id ?? event?.original_transaction_id ?? "").trim();
    const productId = String(event?.product_id ?? "").trim();
    const store = String(event?.store ?? "").trim().toUpperCase();
    const environment = String(event?.environment ?? "").trim().toUpperCase();
    const configuredAppId = String(process.env.REVENUECAT_APP_ID ?? "").trim();
    const allowedEnvironment = String(process.env.REVENUECAT_WEBHOOK_ENVIRONMENT ?? "PRODUCTION").trim().toUpperCase();
    const pkg = COIN_PACKAGES.find((p) => p.sku === productId);

    if (!eventId || !eventType) return res.status(400).json({ error: "RevenueCat event id and type are required" });
    if (configuredAppId && String(event?.app_id ?? "").trim() !== configuredAppId) {
      return res.status(401).json({ error: "RevenueCat app does not match this webhook endpoint" });
    }
    if (!["PRODUCTION", "SANDBOX"].includes(allowedEnvironment)) {
      return res.status(503).json({ error: "RevenueCat webhook environment configuration is invalid" });
    }
    if (environment && environment !== allowedEnvironment) {
      return res.status(400).json({ error: "RevenueCat webhook environment is not allowed" });
    }
    if (!userId || !transactionId) return res.status(400).json({ error: "RevenueCat user and transaction identifiers are required" });
    if (!pkg) return res.status(400).json({ error: "Unknown RevenueCat Coin product" });

    const allowedStores = new Set(["APP_STORE", "PLAY_STORE"]);
    if (!allowedStores.has(store)) return res.status(400).json({ error: "Unsupported RevenueCat store" });

    const purchaseEvents = new Set(["INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"]);
    const refundEvents = new Set(["CANCELLATION"]);
    const db = await getDb();
    const account = ObjectId.isValid(userId) ? await db.collection("users").findOne({ _id: new ObjectId(userId) }, { projection: { _id: 1 } }) : null;
    if (!account) return res.status(404).json({ error: "RevenueCat App User is not a TwiTok account" });

    if (purchaseEvents.has(eventType)) {
      const grossUsd = Number(event?.price);
      const taxPct = Number(event?.tax_percentage ?? 0);
      const commissionPct = Number(event?.commission_percentage ?? 0);
      if (!Number.isFinite(grossUsd) || grossUsd <= 0) return res.status(400).json({ error: "RevenueCat purchase price is invalid" });
      if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 1 || !Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 1) {
        return res.status(400).json({ error: "RevenueCat tax or commission percentage is invalid" });
      }
    }

    if (purchaseEvents.has(eventType)) {
      const grossUsd = Number(event?.price);
      const taxPct = Number(event?.tax_percentage ?? 0);
      const commissionPct = Number(event?.commission_percentage ?? 0);

      const netProceedsUsd = Number((grossUsd * (1 - taxPct - commissionPct)).toFixed(8));
      const result = await creditPurchasedCoins(db, {
        userId,
        coins: pkg.coins,
        provider: "REVENUECAT",
        providerTransactionId: "REVENUECAT:" + store + ":" + transactionId,
        sku: pkg.sku,
        grossUsd,
        netProceedsUsd
      });
      try {
        await db.collection("revenuecat_webhook_events").insertOne({
          eventId, eventType, userId, transactionId, productId, store,
          createdAt: new Date()
        });
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
      }
      return res.status(200).json({ ok: true, duplicate: result.duplicate });
    }

    if (refundEvents.has(eventType) && String(event?.cancel_reason ?? "").toUpperCase() === "CUSTOMER_SUPPORT") {
      const originalTransactionId = "REVENUECAT:" + store + ":" + transactionId;
      const refundGrossUsdRaw = Number(event?.price);
      const taxPct = Number(event?.tax_percentage ?? 0);
      const commissionPct = Number(event?.commission_percentage ?? 0);
      const refundGrossUsd = Number.isFinite(refundGrossUsdRaw) && refundGrossUsdRaw !== 0
        ? Math.abs(refundGrossUsdRaw)
        : undefined;
      const refundNetProceedsUsd = Number(
        (
          (refundGrossUsd ?? 0) *
          Math.max(0, 1 - taxPct - commissionPct)
        ).toFixed(8)
      );
      const original = await db.collection("iap_transactions").findOne(
        { providerTransactionId: originalTransactionId },
        { projection: { netProceedsUsd: 1 } }
      );
      const netRefund = refundNetProceedsUsd > 0
        ? refundNetProceedsUsd
        : Number(original?.netProceedsUsd ?? 0);
      const refundResult = await recordPurchasedCoinRefund(db, {
        providerTransactionId: originalTransactionId,
        refundEventId: eventId,
        refundGrossUsd,
        refundNetProceedsUsd: netRefund
      });
      try {
        await db.collection("revenuecat_webhook_events").insertOne({
          eventId, eventType, userId, transactionId, productId, store,
          createdAt: new Date()
        });
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
      }
      return res.status(200).json({ ok: true, refunded: true, ...refundResult });
    }

    try {
      await db.collection("revenuecat_webhook_events").insertOne({
        eventId, eventType, userId, transactionId, productId, store,
        createdAt: new Date()
      });
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
    return res.status(200).json({ ok: true, ignored: true, eventType });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "IAP webhook failed" });
  }
});

walletRouter.post("/coins/flutterwave/initialize", requireAdultUser, async (req, res) => {
  try {
    const sku = String(req.body?.sku ?? "");
    const pkg = COIN_PACKAGES.find((item) => item.sku === sku);
    if (!pkg) return res.status(400).json({ error: "Invalid Coin package" });

    const db = await getDb();
    const user = await db.collection("users").findOne(
      { _id: req.userId! },
      { projection: { email: 1, phoneNumber: 1, name: 1, countryCode: 1, dateOfBirth: 1 } }
    );
    if (!user?.email) return res.status(400).json({ error: "An email address is required for Coin purchases" });

    if (user.dateOfBirth) {
      const dob = new Date(user.dateOfBirth);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 18);
      if (dob > cutoff) return res.status(403).json({ error: "Coin purchases require an adult account" });
    }

    const countryCode = String(user.countryCode ?? "").toUpperCase();
    const provider = resolveCollectionProvider(countryCode, req.body?.provider ? String(req.body.provider) : undefined);
    if (provider !== "FLUTTERWAVE") return res.status(400).json({ error: "Flutterwave is not the selected provider for this country" });

    const currency = currencyForCountry(countryCode);
    if (!currency) return res.status(400).json({ error: "Unsupported payment currency for this country" });
    const rate = Number(process.env[exchangeRateEnvName(currency)]);
    if (!Number.isFinite(rate) || rate <= 0) return res.status(503).json({ error: currency + " exchange rate is not configured" });

    const amountLocal = Number((pkg.priceUsd * rate).toFixed(2));
    const reference = "TWITOK-FLW-" + randomUUID().replaceAll("-", "").slice(0, 24);
    const result = await initializeFlutterwaveCheckout({
      email: user.email,
      phoneNumber: user.phoneNumber ? String(user.phoneNumber) : undefined,
      name: user.name ? String(user.name) : undefined,
      amount: amountLocal,
      currency,
      reference,
      redirectUrl: process.env.TWITOK_FLUTTERWAVE_CALLBACK_URL,
      paymentOptions: process.env.TWITOK_FLUTTERWAVE_PAYMENT_OPTIONS,
      userId: req.userId!.toHexString(),
      sku: pkg.sku,
      coins: pkg.coins
    });

    await db.collection("coin_purchases").insertOne({
      reference,
      userId: req.userId!.toHexString(),
      sku: pkg.sku,
      coins: pkg.coins,
      priceUsd: pkg.priceUsd,
      amountLocal,
      currency,
      status: "INITIALIZED",
      provider: "FLUTTERWAVE",
      createdAt: new Date()
    });

    return res.status(201).json({ reference, authorizationUrl: result.link, amount: amountLocal, currency, coins: pkg.coins, provider: "FLUTTERWAVE" });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Flutterwave Coin purchase initialization failed" });
  }
});

walletRouter.post("/coins/flutterwave/webhook", async (req, res) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    const signature = req.header("verif-hash") ?? req.header("x-flutterwave-signature");
    if (!verifyFlutterwaveWebhookSignature(rawBody, signature)) return res.status(401).json({ error: "Invalid signature" });

    const transactionId = String(req.body?.data?.id ?? "");
    const reference = String(req.body?.data?.tx_ref ?? "");
    if (!transactionId || !reference) return res.status(400).json({ error: "Flutterwave transaction identifiers missing" });

    const db = await getDb();
    const purchase = await db.collection("coin_purchases").findOne({ reference, provider: "FLUTTERWAVE" });
    if (!purchase) return res.status(404).json({ error: "Coin purchase not found" });
    if (purchase.status === "CREDITED") return res.json({ ok: true, duplicate: true });

    const verified = await verifyFlutterwaveTransaction(transactionId);
    if (verified.status !== "successful" || verified.tx_ref !== reference || verified.currency !== String(purchase.currency)) {
      return res.status(400).json({ error: "Flutterwave payment verification failed" });
    }
    if (Number(verified.amount) < Number(purchase.amountLocal)) {
      return res.status(400).json({ error: "Flutterwave payment amount mismatch" });
    }

    const currency = String(purchase.currency);
    const rate = Number(process.env[exchangeRateEnvName(currency)]);
    if (!Number.isFinite(rate) || rate <= 0) return res.status(503).json({ error: currency + " exchange rate is not configured" });

    const grossUsd = Number(purchase.priceUsd);
    const feeBps = Number(process.env.TWITOK_FLUTTERWAVE_COLLECTION_FEE_BPS ?? 0);
    const taxBps = Number(process.env.TWITOK_FLUTTERWAVE_COLLECTION_TAX_BPS ?? 0);
    if (!Number.isFinite(feeBps) || feeBps < 0 || !Number.isFinite(taxBps) || taxBps < 0) {
      return res.status(503).json({ error: "Flutterwave net-proceeds configuration is invalid" });
    }
    const netProceedsUsd = Number((grossUsd * Math.max(0, 1 - (feeBps + taxBps) / 10000)).toFixed(8));
    const result = await creditPurchasedCoins(db, {
      userId: String(purchase.userId),
      coins: Number(purchase.coins),
      provider: "FLUTTERWAVE",
      providerTransactionId: "FLUTTERWAVE:" + transactionId,
      sku: String(purchase.sku),
      grossUsd,
      netProceedsUsd
    });
    await db.collection("coin_purchases").updateOne({ reference }, {
      $set: { status: "CREDITED", creditedAt: new Date(), providerTransactionId: transactionId }
    });
    return res.json({ ok: true, duplicate: result.duplicate, coins: purchase.coins });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Flutterwave Coin payment webhook failed" });
  }
});

walletRouter.post("/coins/paystack/webhook", async (req, res) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    if (!verifyPaystackWebhookSignature(rawBody, req.header("x-paystack-signature"))) return res.status(401).json({ error: "Invalid signature" });
    if (String(req.body?.event ?? "") !== "charge.success") return res.json({ ok: true, ignored: true });
    const reference = String(req.body?.data?.reference ?? "");
    if (!reference) return res.status(400).json({ error: "Payment reference missing" });
    const verified = await verifyPaystackTransaction(reference);
    if (verified.status !== "success" || verified.currency !== "GHS") return res.status(400).json({ error: "Payment is not successful" });
    const db = await getDb();
    const purchase = await db.collection("coin_purchases").findOne({ reference, provider: "PAYSTACK" });
    if (!purchase) return res.status(404).json({ error: "Coin purchase not found" });
    const rate = Number(process.env.TWITOK_USD_GHS_RATE);
    const expectedAmount = Math.round(Number(purchase.amountGhs) * 100);
    if (!Number.isFinite(rate) || Math.abs(Number(verified.amount) - expectedAmount) > 1) return res.status(400).json({ error: "Payment amount mismatch" });
    if (purchase.status === "CREDITED") return res.json({ ok: true, duplicate: true });
    const grossUsd = Number(purchase.priceUsd);
    const feeBps = Number(process.env.TWITOK_PAYSTACK_COLLECTION_FEE_BPS);
    const taxBps = Number(process.env.TWITOK_PAYSTACK_COLLECTION_TAX_BPS ?? 0);
    if (!Number.isFinite(feeBps) || feeBps < 0 || !Number.isFinite(taxBps) || taxBps < 0) return res.status(503).json({ error: "Paystack net-proceeds configuration is required before Coin crediting" });
    const netProceedsUsd = Number((grossUsd * Math.max(0, 1 - (feeBps + taxBps) / 10000)).toFixed(8));
    const result = await creditPurchasedCoins(db, { userId: String(purchase.userId), coins: Number(purchase.coins), provider: "PAYSTACK", providerTransactionId: reference, sku: String(purchase.sku), grossUsd, netProceedsUsd });
    await db.collection("coin_purchases").updateOne({ reference, provider: "PAYSTACK" }, { $set: { status: "CREDITED", creditedAt: new Date() } });
    return res.json({ ok: true, duplicate: result.duplicate, coins: purchase.coins });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Coin payment webhook failed" }); }
});

walletRouter.post("/payout/paystack/webhook", async (req, res) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    if (!verifyPaystackWebhookSignature(rawBody, req.header("x-paystack-signature"))) return res.status(401).json({ error: "Invalid signature" });
    const event = String(req.body?.event ?? "");
    if (!["transfer.success", "transfer.failed", "transfer.reversed"].includes(event)) return res.json({ ok: true, ignored: true });
    const reference = String(req.body?.data?.reference ?? "");
    const eventId = String(req.body?.data?.id ?? reference + ":" + event);
    if (!reference) return res.status(400).json({ error: "Transfer reference missing" });
    const result = await reconcilePaystackTransfer(await getDb(), { eventId, event: event as "transfer.success" | "transfer.failed" | "transfer.reversed", reference, rawStatus: String(req.body?.data?.status ?? "") });
    return res.json({ ok: true, ...result });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Payout webhook failed" }); }
});

walletRouter.post("/gifts", requireAdultUser, async (req, res) => {
  try {
    const { receiverId, giftId, quantity, context = "VIDEO", videoId } = req.body ?? {};
    const senderId = req.userId!.toHexString();
    if (!receiverId || !giftId) return res.status(400).json({ error: "receiverId and giftId are required" });
    const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
    if (!idempotencyKey) return res.status(400).json({ error: "Idempotency-Key header is required" });
    const result = await sendGift(await getDb(), { senderId, receiverId: String(receiverId), giftId, quantity, context, videoId: videoId ? String(videoId) : undefined, idempotencyKey });
    if (!result.duplicate) {
      broadcastToUser(String(receiverId), {
        type: "gift.received",
        transactionId: result.transactionId,
        videoId: result.videoId ?? null,
        giftId,
        quantity: result.quantity,
        coinsSpent: result.coinsSpent,
        diamondsAwarded: result.diamondsAwarded,
        animation: result.gift?.animation ?? giftId
      });
      broadcastToUser(senderId, {
        type: "gift.sent",
        transactionId: result.transactionId,
        videoId: result.videoId ?? null,
        receiverId: String(receiverId),
        giftId,
        quantity: result.quantity,
        coinsSpent: result.coinsSpent,
        animation: result.gift?.animation ?? giftId
      });
    }
    return res.status(201).json(result);
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Gift failed" }); }
});

walletRouter.get("/payout/ghana/options", requireUser, async (req, res) => {
  try {
    const type = String(req.query.type ?? "bank") === "mobile_money" ? "mobile_money" : "bank";
    return res.json({ countryCode: "GH", type, providers: await listGhanaPayoutBanks(type) });
  } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Payout provider unavailable" }); }
});

walletRouter.get("/payout/flutterwave/options", requireUser, async (req, res) => {
  try {
    const user = await (await getDb()).collection("users").findOne({ _id: req.userId! }, { projection: { countryCode: 1 } });
    const countryCode = String(user?.countryCode ?? "").toUpperCase();
    if (!countryCode) return res.status(400).json({ error: "Account country is required for payouts" });
    if (!payoutProviders(countryCode).includes("FLUTTERWAVE")) return res.status(400).json({ error: "Flutterwave payouts are not enabled for this country" });
    const banks = await listFlutterwaveBanks(countryCode);
    return res.json({ countryCode, type: String(req.query.type ?? "bank").toUpperCase() === "MOBILE_MONEY" ? "MOBILE_MONEY" : "BANK", providers: banks });
  } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Flutterwave payout options unavailable" }); }
});

walletRouter.post("/payout/flutterwave/webhook", async (req, res) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    const signature = req.header("verif-hash") ?? req.header("x-flutterwave-signature");
    if (!verifyFlutterwaveWebhookSignature(rawBody, signature)) return res.status(401).json({ error: "Invalid signature" });
    const event = String(req.body?.event ?? "");
    if (event !== "transfer.completed") return res.json({ ok: true, ignored: true });
    const data = req.body?.data ?? {};
    const transferId = String(data?.id ?? "");
    const reference = String(data?.reference ?? "");
    const status = String(data?.status ?? "");
    if (!transferId || !reference || !status) return res.status(400).json({ error: "Flutterwave transfer identifiers missing" });
    const result = await reconcileFlutterwaveTransfer(await getDb(), { eventId: transferId + ":" + status, transferId, reference, status, rawMessage: String(data?.complete_message ?? "") });
    return res.json({ ok: true, ...result });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Flutterwave payout webhook failed" }); }
});

walletRouter.get("/withdrawals/:withdrawalId/refresh", requireUser, async (req, res) => {
  try {
    const withdrawalId = String(req.params.withdrawalId);
    const withdrawal = await (await getDb()).collection("withdrawals").findOne({ withdrawalId, userId: req.userId!.toHexString() });
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });
    if (withdrawal.provider !== "FLUTTERWAVE") return res.status(400).json({ error: "This withdrawal is not a Flutterwave payout" });
    const result = await refreshFlutterwaveWithdrawal(await getDb(), withdrawalId);
    return res.json({ withdrawalId, ...result });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal status refresh failed" }); }
});

walletRouter.post("/withdrawals", requireAdultUser, async (req, res) => {
  try {
    const { countryCode, type, amountUsd, destination, provider: requestedProvider } = req.body ?? {};
    const userId = req.userId!.toHexString();
    const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
    if (!idempotencyKey) return res.status(400).json({ error: "Idempotency-Key header is required" });
    const db = await getDb();
    const existing = await db.collection("withdrawals").findOne({ userId, idempotencyKey });
    if (existing) return res.status(200).json({ status: existing.status, withdrawalId: existing.withdrawalId, provider: existing.provider ?? "PENDING", duplicate: true });

    const user = await db.collection("users").findOne({ _id: req.userId! }, { projection: { countryCode: 1 } });
    const accountCountry = String(user?.countryCode ?? "").toUpperCase();
    if (!accountCountry) return res.status(400).json({ error: "Account country is required for payouts" });
    if (!countryCode || String(countryCode).toUpperCase() !== accountCountry) return res.status(400).json({ error: "Payout country must match the verified account country" });
    if (!type || !destination) return res.status(400).json({ error: "type and destination are required" });
    const payoutType = String(type).toUpperCase();
    if (!["BANK", "MOBILE_MONEY"].includes(payoutType)) return res.status(400).json({ error: "Invalid payout type" });
    if (Number(amountUsd) < MIN_WITHDRAWAL_USD) return res.status(400).json({ error: "Minimum withdrawal is $" + MIN_WITHDRAWAL_USD });

    const provider = resolvePayoutProvider(accountCountry, requestedProvider ? String(requestedProvider) : undefined);
    const currency = currencyForCountry(accountCountry);
    if (!currency) return res.status(400).json({ error: "Unsupported payout currency for this country" });
    const exchangeRate = Number(process.env[exchangeRateEnvName(currency)]);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return res.status(503).json({ error: currency + " payout exchange rate is not configured" });

    const withdrawalId = randomUUID();
    await createWithdrawal(db, { withdrawalId, userId, countryCode: accountCountry, type: payoutType as "BANK" | "MOBILE_MONEY", amountUsd: Number(amountUsd), exchangeRate, destination, idempotencyKey });

    let payout;
    try {
      payout = provider === "PAYSTACK" ? await processGhanaWithdrawal(db, withdrawalId) : await processFlutterwaveWithdrawal(db, withdrawalId);
    } catch (error) {
      return res.status(502).json({ status: "FAILED", withdrawalId, provider, error: error instanceof Error ? error.message : "Payout provider failed" });
    }
    return res.status(201).json({ status: payout?.status ?? "PROCESSING", withdrawalId, provider });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Withdrawal failed" }); }
});

walletRouter.get("/:userId", requireUser, async (req, res) => {
  try {
    const requested = String(req.params.userId);
    if (requested !== req.userId!.toHexString()) return res.status(403).json({ error: "You can only access your own wallet" });
    return res.json(await ensureWallet(await getDb(), requested));
  }
  catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Wallet lookup failed" }); }
})

/**
 * TwiTok Shop benchmark configuration.
 *
 * Product strategy: benchmark the documented TikTok Shop commerce workflows
 * (catalog, Showcase, creator/affiliate commerce, LIVE shopping, orders,
 * fulfillment, analytics, finance and customer tools) without copying
 * proprietary implementation details or UI.
 *
 * Currency/pricing for merchandise is seller-defined. TwiTok should not
 * hard-code product prices or transaction fees in this feature benchmark.
 */

export const TWITOK_SHOP_BENCHMARK_VERSION = "2026-09-30";

export const TWITOK_SHOP_SURFACES = [
  "SHOP_PROFILE",
  "PRODUCT_SHOWCASE",
  "IN_FEED_PRODUCT_CARD",
  "VIDEO_PRODUCT_TAG",
  "LIVE_SHOPPING_BAG",
  "SEARCH",
  "CATEGORY",
  "CART",
  "CHECKOUT",
  "ORDER_TRACKING"
] as const;

export const TWITOK_SHOP_FEATURES = {
  CATALOG: [
    "product_listing",
    "variants_and_skus",
    "multiple_product_images",
    "product_video",
    "categories",
    "attributes",
    "seller_defined_price",
    "seller_defined_inventory",
    "bulk_product_import",
    "draft_and_publish",
    "listing_quality_checks",
    "product_search_and_discovery"
  ],
  STOREFRONT: [
    "business_shop_profile",
    "creator_showcase",
    "product_collections",
    "featured_products",
    "shop_search",
    "product_reviews",
    "ratings",
    "wishlist"
  ],
  SOCIAL_COMMERCE: [
    "video_product_tagging",
    "creator_product_tagging",
    "affiliate_creator_links",
    "creator_commission_configuration",
    "creator_product_requests",
    "creator_performance_analytics",
    "live_product_pinning",
    "live_shopping_bag",
    "live_fixed_price_sales",
    "live_auction_support"
  ],
  CHECKOUT: [
    "cart",
    "guest_checkout_where_supported",
    "account_checkout",
    "address_book",
    "delivery_method_selection",
    "shipping_fee_calculation",
    "tax_calculation",
    "discount_codes",
    "seller_promotions",
    "order_confirmation",
    "payment_status"
  ],
  ORDERS: [
    "order_management",
    "order_status_timeline",
    "seller_fulfillment_queue",
    "shipping_labels",
    "tracking_number",
    "partial_fulfillment",
    "cancellation_workflow",
    "returns_workflow",
    "refund_workflow",
    "customer_service"
  ],
  INVENTORY: [
    "real_time_stock",
    "low_stock_alerts",
    "out_of_stock_state",
    "warehouse_inventory",
    "inventory_adjustments",
    "inventory_reservations",
    "sku_level_inventory"
  ],
  LOGISTICS: [
    "warehouse_management",
    "pickup_address",
    "return_address",
    "shipping_methods",
    "carrier_tracking",
    "delivery_estimates",
    "seller_fulfillment",
    "logistics_partner_integrations"
  ],
  MARKETING: [
    "shop_promotions",
    "seller_discounts",
    "free_shipping_promotions",
    "product_campaigns",
    "creator_affiliate_campaigns",
    "shop_ads_integration",
    "content_driven_product_discovery"
  ],
  ANALYTICS: [
    "shop_gmv",
    "orders",
    "units_sold",
    "conversion_rate",
    "product_performance",
    "traffic_sources",
    "content_attribution",
    "creator_attribution",
    "live_commerce_analytics",
    "customer_metrics",
    "inventory_metrics",
    "refund_return_metrics"
  ],
  FINANCE: [
    "seller_balance",
    "settlement_records",
    "payout_status",
    "transaction_history",
    "refund_adjustments",
    "fee_breakdown",
    "tax_records",
    "invoices_and_receipts"
  ],
  TRUST_AND_SAFETY: [
    "seller_verification",
    "product_policy_checks",
    "restricted_product_workflow",
    "prohibited_product_blocking",
    "fraud_detection_hooks",
    "order_risk_checks",
    "customer_data_protection",
    "audit_logs"
  ]
} as const;

export const TWITOK_SHOP_ROLES = [
  "SHOP_OWNER",
  "SHOP_ADMIN",
  "SHOP_MANAGER",
  "CATALOG_MANAGER",
  "ORDER_MANAGER",
  "CUSTOMER_SUPPORT",
  "MARKETING_MANAGER",
  "FINANCE_MANAGER",
  "CREATOR_PARTNER"
] as const;

export const TWITOK_SHOP_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
  "REFUND_PENDING",
  "REFUNDED",
  "COMPLETED"
] as const;

export const TWITOK_SHOP_PRODUCT_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "ACTIVE",
  "PAUSED",
  "OUT_OF_STOCK",
  "REJECTED",
  "ARCHIVED"
] as const;

export const TWITOK_SHOP_CHECKOUT_REQUIREMENTS = {
  requireSellerStockReservation: true,
  requireOrderIdempotency: true,
  requirePaymentVerification: true,
  releaseReservedStockOnPaymentFailure: true,
  preventNegativeInventory: true,
  recordCurrencyAndFxQuote: true
} as const;

/**
 * Seller-defined commerce economics.
 *
 * Merchandise prices, shipping charges, taxes and creator commissions should
 * be calculated from seller configuration and current market/provider data.
 * These defaults intentionally do not impose a hard-coded shop commission.
 */
export const TWITOK_SHOP_ECONOMICS = {
  currencyModel: "SELLER_CURRENCY_WITH_USD_CANONICAL_LEDGER",
  productPriceModel: "SELLER_DEFINED",
  shippingModel: "SELLER_OR_CARRIER_DEFINED",
  taxModel: "JURISDICTION_AND_PRODUCT_RULES",
  creatorCommissionModel: "SELLER_DEFINED",
  platformFeeModel: "CONFIGURABLE",
  fxQuoteLockMinutes: 15
} as const;

export const TWITOK_SHOP_BENCHMARK_WORKFLOWS = [
  "SELLER_ONBOARDING",
  "ADD_PRODUCT",
  "PUBLISH_PRODUCT",
  "CUSTOMER_DISCOVERY",
  "ADD_TO_CART",
  "CHECKOUT_AND_PAY",
  "SELLER_FULFILLMENT",
  "DELIVERY_AND_TRACKING",
  "RETURN_AND_REFUND",
  "CREATOR_AFFILIATE_SALE",
  "LIVE_SHOPPING",
  "SHOP_ANALYTICS",
  "SELLER_SETTLEMENT"
] as const;

export function isSupportedShopSurface(surface: string) {
  return TWITOK_SHOP_SURFACES.includes(surface as (typeof TWITOK_SHOP_SURFACES)[number]);
}

export function getShopBenchmarkFeatureGroups() {
  return Object.entries(TWITOK_SHOP_FEATURES).map(([group, features]) => ({
    group,
    features: [...features]
  }));
}

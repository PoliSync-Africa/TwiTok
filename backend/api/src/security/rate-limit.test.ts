import test from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { rateLimit as expressRateLimit, ipKeyGenerator } from "express-rate-limit";
import { getClientIp, authRateLimit } from "./rate-limit.js";

// Helper emulating the route key generator used in analytics and wallet
function createRouteKeyGenerator() {
  return (req: Request) => (req as any).userId?.toHexString?.() ?? ipKeyGenerator(req.ip ?? "unknown");
}

test("IPv4 addresses remain unchanged in getClientIp and key generators", () => {
  const req1 = { ip: "198.51.100.42" } as Request;
  const req2 = { ip: "127.0.0.1" } as Request;
  const keyGen = createRouteKeyGenerator();

  assert.equal(getClientIp(req1), "198.51.100.42");
  assert.equal(getClientIp(req2), "127.0.0.1");
  assert.equal(keyGen(req1), "198.51.100.42");
  assert.equal(keyGen(req2), "127.0.0.1");
});

test("IPv6 addresses in the same /56 subnet share the exact same key", () => {
  const ipA = "2001:db8:abcd:1200::1";
  const ipB = "2001:db8:abcd:12ff:ffff:ffff:ffff:ffff";
  const reqA = { ip: ipA } as Request;
  const reqB = { ip: ipB } as Request;
  const keyGen = createRouteKeyGenerator();

  const keyA = getClientIp(reqA);
  const keyB = getClientIp(reqB);

  // Both should resolve to the /56 subnet representation
  assert.equal(keyA, keyB);
  assert.equal(keyA, "2001:db8:abcd:1200::/56");

  // Route key generator should also produce identical keys
  assert.equal(keyGen(reqA), keyGen(reqB));
  assert.equal(keyGen(reqA), "2001:db8:abcd:1200::/56");

  // authRateLimit should share the limit for the same account under the same /56 subnet
  const authReqA = { ip: ipA, body: { email: "creator@twitok.com" } } as Request;
  const authReqB = { ip: ipB, body: { email: "creator@twitok.com" } } as Request;
  assert.equal(authRateLimit(authReqA), authRateLimit(authReqB));
  assert.equal(authRateLimit(authReqA), "2001:db8:abcd:1200::/56:creator@twitok.com");
});

test("IPv6 addresses in different /56 subnets receive distinct keys", () => {
  const req1 = { ip: "2001:db8:abcd:1200::1" } as Request;
  const req2 = { ip: "2001:db8:abcd:1300::1" } as Request;
  const keyGen = createRouteKeyGenerator();

  assert.notEqual(getClientIp(req1), getClientIp(req2));
  assert.notEqual(keyGen(req1), keyGen(req2));
});

test("Authenticated user ID takes precedence over IP address", () => {
  const req = {
    userId: { toHexString: () => "64b0f1a23c4d5e6f7a8b9c0d" },
    ip: "2001:db8:abcd:1200::1"
  } as unknown as Request;
  const keyGen = createRouteKeyGenerator();

  assert.equal(keyGen(req), "64b0f1a23c4d5e6f7a8b9c0d");
});

test("Fallback returns 'unknown' when neither user ID nor IP is available", () => {
  const req = {} as Request;
  const keyGen = createRouteKeyGenerator();

  assert.equal(getClientIp(req), "unknown");
  assert.equal(keyGen(req), "unknown");
});

test("expressRateLimit config does not throw ERR_ERL_KEY_GEN_IPV6 with ipKeyGenerator", () => {
  assert.doesNotThrow(() => {
    expressRateLimit({
      windowMs: 60 * 1000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => (req as any).userId?.toHexString?.() ?? ipKeyGenerator(req.ip ?? "unknown")
    });
  });
});

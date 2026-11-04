export function authRateLimit() {
  const buckets = new Map();
  return (req, res, next) => {
    if (process.env.NODE_ENV === "test" || req.method !== "POST") return next();
    const now = Date.now(),
      key = req.ip;
    for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
    const bucket = buckets.get(key) || {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    bucket.count++;
    buckets.set(key, bucket);
    if (bucket.count > 60) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.until - now) / 1000))
      );
      return res
        .status(429)
        .json({ error: "Muitas tentativas. Tente novamente mais tarde." });
    }
    next();
  };
}

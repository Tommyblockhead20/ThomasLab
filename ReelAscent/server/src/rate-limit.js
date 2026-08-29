export class RateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  allow(name, limit, windowMs, now = Date.now()) {
    let bucket = this.buckets.get(name);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
      this.buckets.set(name, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }
}

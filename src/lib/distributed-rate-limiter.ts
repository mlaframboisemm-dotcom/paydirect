/**
 * Distributed Rate Limiting
 * Implements per-user and per-IP rate limiting
 * Can be upgraded to Redis for multi-instance deployment
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator: (req: any) => string; // Function to generate rate limit key
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  requests: Array<{ timestamp: number; statusCode?: number }>;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timer | null = null;

  constructor(private config: RateLimitConfig) {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  private getOrCreateEntry(key: string): RateLimitEntry {
    let entry = this.store.get(key);
    if (!entry) {
      entry = {
        count: 0,
        resetTime: Date.now() + this.config.windowMs,
        requests: []
      };
      this.store.set(key, entry);
    }
    
    // Reset if window expired
    if (Date.now() > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: Date.now() + this.config.windowMs,
        requests: []
      };
      this.store.set(key, entry);
    }
    
    return entry;
  }

  isLimited(req: any, res?: any): boolean {
    const key = this.config.keyGenerator(req);
    const entry = this.getOrCreateEntry(key);
    
    // Check if limited
    if (entry.count >= this.config.maxRequests) {
      return true;
    }
    
    return false;
  }

  recordRequest(req: any, statusCode: number = 200): void {
    const key = this.config.keyGenerator(req);
    const entry = this.getOrCreateEntry(key);
    
    // Skip counting if configured
    if (this.config.skipSuccessfulRequests && statusCode >= 200 && statusCode < 300) {
      return;
    }
    if (this.config.skipFailedRequests && statusCode >= 400) {
      return;
    }
    
    entry.count += 1;
    entry.requests.push({ timestamp: Date.now(), statusCode });
  }

  getStatus(req: any): { count: number; limit: number; remaining: number; resetTime: number } {
    const key = this.config.keyGenerator(req);
    const entry = this.getOrCreateEntry(key);
    
    return {
      count: entry.count,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: entry.resetTime
    };
  }

  reset(req: any): void {
    const key = this.config.keyGenerator(req);
    this.store.delete(key);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval as any);
    }
    this.store.clear();
  }
}

/**
 * Express middleware factory for rate limiting
 */
export function createRateLimiter(config: RateLimitConfig) {
  const limiter = new RateLimiter(config);

  return (req: any, res: any, next: any) => {
    if (limiter.isLimited(req)) {
      const status = limiter.getStatus(req);
      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((status.resetTime - Date.now()) / 1000)
      });
    }

    // Add rate limit info to response headers
    const status = limiter.getStatus(req);
    res.setHeader('X-RateLimit-Limit', String(status.limit));
    res.setHeader('X-RateLimit-Remaining', String(status.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(status.resetTime / 1000)));

    // Record request when response is sent
    const originalSend = res.send;
    res.send = function(data: any) {
      limiter.recordRequest(req, res.statusCode);
      originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Predefined rate limiters for common scenarios
 */

export const PerUserWithdrawalLimiter = (maxWithdrawalsPerHour: number = 5) =>
  createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: maxWithdrawalsPerHour,
    keyGenerator: (req: any) => `withdrawal:${req.user?.id || req.ip}`,
    skipFailedRequests: false
  });

export const PerUserTradeLimiter = (maxTradesPerHour: number = 50) =>
  createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: maxTradesPerHour,
    keyGenerator: (req: any) => `trade:${req.user?.id || req.ip}`,
    skipFailedRequests: false
  });

export const PerIpLoginLimiter = (maxAttemptsPerHour: number = 20) =>
  createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: maxAttemptsPerHour,
    keyGenerator: (req: any) => `login:${req.ip}`,
    skipFailedRequests: false
  });

export const PerUserApiCallLimiter = (maxCallsPerMinute: number = 60) =>
  createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: maxCallsPerMinute,
    keyGenerator: (req: any) => `api:${req.user?.id || req.ip}`,
    skipFailedRequests: true
  });

export const PerIpGeneralLimiter = (maxRequestsPerMinute: number = 100) =>
  createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: maxRequestsPerMinute,
    keyGenerator: (req: any) => `general:${req.ip}`,
    skipFailedRequests: false
  });

export default RateLimiter;

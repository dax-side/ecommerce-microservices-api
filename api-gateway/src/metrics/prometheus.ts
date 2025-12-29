// ===== Prometheus Metrics Module =====
// Provides application-level metrics for monitoring

import { Request, Response, NextFunction } from 'express';

// ===== Metrics Storage =====
interface MetricValue {
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

interface MetricsStore {
  counters: Map<string, number>;
  gauges: Map<string, number>;
  histograms: Map<string, number[]>;
  labeledCounters: Map<string, MetricValue[]>;
}

const metrics: MetricsStore = {
  counters: new Map(),
  gauges: new Map(),
  histograms: new Map(),
  labeledCounters: new Map(),
};

// ===== Service Info =====
let serviceName = 'unknown';
let servicePort = 3000;
const startTime = Date.now();

export function initMetrics(name: string, port: number) {
  serviceName = name;
  servicePort = port;
}

// ===== Counter Operations =====
export function incrementCounter(name: string, value = 1) {
  const current = metrics.counters.get(name) || 0;
  metrics.counters.set(name, current + value);
}

export function incrementLabeledCounter(name: string, labels: Record<string, string>, value = 1) {
  const key = name;
  const existing = metrics.labeledCounters.get(key) || [];
  
  // Find existing entry with same labels
  const labelKey = JSON.stringify(labels);
  const idx = existing.findIndex(e => JSON.stringify(e.labels) === labelKey);
  
  if (idx >= 0) {
    existing[idx].value += value;
  } else {
    existing.push({ value, labels, timestamp: Date.now() });
  }
  
  metrics.labeledCounters.set(key, existing);
}

// ===== Gauge Operations =====
export function setGauge(name: string, value: number) {
  metrics.gauges.set(name, value);
}

export function incrementGauge(name: string, value = 1) {
  const current = metrics.gauges.get(name) || 0;
  metrics.gauges.set(name, current + value);
}

export function decrementGauge(name: string, value = 1) {
  const current = metrics.gauges.get(name) || 0;
  metrics.gauges.set(name, current - value);
}

// ===== Histogram Operations =====
export function observeHistogram(name: string, value: number) {
  const existing = metrics.histograms.get(name) || [];
  existing.push(value);
  
  // Keep only last 1000 observations
  if (existing.length > 1000) {
    existing.shift();
  }
  
  metrics.histograms.set(name, existing);
}

// ===== Calculate Histogram Buckets =====
function calculateHistogramBuckets(values: number[], buckets: number[]): Map<number, number> {
  const result = new Map<number, number>();
  
  for (const bucket of buckets) {
    result.set(bucket, values.filter(v => v <= bucket).length);
  }
  result.set(Infinity, values.length);
  
  return result;
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// ===== Express Middleware for Request Metrics =====
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Track active requests
  incrementGauge('http_requests_in_flight');
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const path = req.route?.path || req.path;
    const method = req.method;
    const status = res.statusCode;
    const statusClass = `${Math.floor(status / 100)}xx`;
    
    // Decrement active requests
    decrementGauge('http_requests_in_flight');
    
    // Increment request counter with labels
    incrementLabeledCounter('http_requests_total', {
      method,
      path,
      status: String(status),
      status_class: statusClass
    });
    
    // Record request duration
    observeHistogram('http_request_duration_ms', duration);
    
    // Track errors
    if (status >= 400) {
      incrementLabeledCounter('http_errors_total', {
        method,
        path,
        status: String(status)
      });
    }
  });
  
  next();
}

// ===== Generate Prometheus Format Output =====
export function generatePrometheusMetrics(): string {
  const lines: string[] = [];
  const timestamp = Date.now();
  
  // ===== Service Info =====
  lines.push('# HELP service_info Service information');
  lines.push('# TYPE service_info gauge');
  lines.push(`service_info{service="${serviceName}",port="${servicePort}"} 1`);
  
  // ===== Uptime =====
  lines.push('# HELP process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds{service="${serviceName}"} ${(Date.now() - startTime) / 1000}`);
  
  // ===== Memory Usage =====
  const memUsage = process.memoryUsage();
  lines.push('# HELP nodejs_heap_size_total_bytes Total heap size');
  lines.push('# TYPE nodejs_heap_size_total_bytes gauge');
  lines.push(`nodejs_heap_size_total_bytes{service="${serviceName}"} ${memUsage.heapTotal}`);
  
  lines.push('# HELP nodejs_heap_size_used_bytes Used heap size');
  lines.push('# TYPE nodejs_heap_size_used_bytes gauge');
  lines.push(`nodejs_heap_size_used_bytes{service="${serviceName}"} ${memUsage.heapUsed}`);
  
  lines.push('# HELP nodejs_external_memory_bytes External memory');
  lines.push('# TYPE nodejs_external_memory_bytes gauge');
  lines.push(`nodejs_external_memory_bytes{service="${serviceName}"} ${memUsage.external}`);
  
  lines.push('# HELP nodejs_rss_bytes Resident Set Size');
  lines.push('# TYPE nodejs_rss_bytes gauge');
  lines.push(`nodejs_rss_bytes{service="${serviceName}"} ${memUsage.rss}`);
  
  // ===== Simple Counters =====
  for (const [name, value] of metrics.counters) {
    lines.push(`# HELP ${name} Counter metric`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name}{service="${serviceName}"} ${value}`);
  }
  
  // ===== Labeled Counters =====
  const labeledGroups = new Map<string, MetricValue[]>();
  for (const [name, values] of metrics.labeledCounters) {
    lines.push(`# HELP ${name} Counter metric with labels`);
    lines.push(`# TYPE ${name} counter`);
    
    for (const { value, labels } of values) {
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${name}{service="${serviceName}",${labelStr}} ${value}`);
    }
  }
  
  // ===== Gauges =====
  for (const [name, value] of metrics.gauges) {
    lines.push(`# HELP ${name} Gauge metric`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name}{service="${serviceName}"} ${value}`);
  }
  
  // ===== Histograms =====
  const histogramBuckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  
  for (const [name, values] of metrics.histograms) {
    if (values.length === 0) continue;
    
    const buckets = calculateHistogramBuckets(values, histogramBuckets);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;
    
    lines.push(`# HELP ${name} Histogram metric`);
    lines.push(`# TYPE ${name} histogram`);
    
    for (const [bucket, bucketCount] of buckets) {
      const le = bucket === Infinity ? '+Inf' : String(bucket);
      lines.push(`${name}_bucket{service="${serviceName}",le="${le}"} ${bucketCount}`);
    }
    
    lines.push(`${name}_sum{service="${serviceName}"} ${sum}`);
    lines.push(`${name}_count{service="${serviceName}"} ${count}`);
    
    // Add percentiles as summary
    const p50 = calculatePercentile(values, 50);
    const p90 = calculatePercentile(values, 90);
    const p95 = calculatePercentile(values, 95);
    const p99 = calculatePercentile(values, 99);
    
    lines.push(`# HELP ${name}_percentiles Percentile values`);
    lines.push(`# TYPE ${name}_percentiles gauge`);
    lines.push(`${name}_percentiles{service="${serviceName}",quantile="0.5"} ${p50}`);
    lines.push(`${name}_percentiles{service="${serviceName}",quantile="0.9"} ${p90}`);
    lines.push(`${name}_percentiles{service="${serviceName}",quantile="0.95"} ${p95}`);
    lines.push(`${name}_percentiles{service="${serviceName}",quantile="0.99"} ${p99}`);
  }
  
  return lines.join('\n');
}

// ===== Express Endpoint Handler =====
export function metricsEndpoint(req: Request, res: Response) {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(generatePrometheusMetrics());
}

// ===== Get Metrics Summary (JSON format) =====
export function getMetricsSummary() {
  const httpDurations = metrics.histograms.get('http_request_duration_ms') || [];
  
  return {
    service: serviceName,
    port: servicePort,
    uptime: (Date.now() - startTime) / 1000,
    memory: process.memoryUsage(),
    requests: {
      total: Array.from(metrics.labeledCounters.get('http_requests_total') || [])
        .reduce((sum, m) => sum + m.value, 0),
      inFlight: metrics.gauges.get('http_requests_in_flight') || 0,
      errors: Array.from(metrics.labeledCounters.get('http_errors_total') || [])
        .reduce((sum, m) => sum + m.value, 0),
    },
    latency: {
      count: httpDurations.length,
      avg: httpDurations.length > 0 ? httpDurations.reduce((a, b) => a + b, 0) / httpDurations.length : 0,
      p50: calculatePercentile(httpDurations, 50),
      p95: calculatePercentile(httpDurations, 95),
      p99: calculatePercentile(httpDurations, 99),
    },
    counters: Object.fromEntries(metrics.counters),
    gauges: Object.fromEntries(metrics.gauges),
  };
}

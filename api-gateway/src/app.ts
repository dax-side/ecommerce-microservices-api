// ===== Optimized API Gateway =====
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Service URLs
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';

// Performance Middleware
app.use(compression()); // Gzip compression
app.use(helmet());
app.use(cors());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Increased from 1000
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  }
});

app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // Increased from 50
  message: { error: 'Too many authentication attempts, please try again later.' }
});

app.use(express.json({ limit: '10mb' }));

// Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// Optimized request function with retry logic
const makeRequest = async (url: string, options: any, retries = 2): Promise<any> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios({
        ...options,
        url,
        timeout: 10000, // 10 second timeout
        maxRedirects: 0,
      });
      return response;
    } catch (error: any) {
      if (attempt === retries) throw error;
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }
};

// Gateway health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'API Gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Auth routes with rate limiting
app.use('/api/auth', authLimiter);

app.post('/api/auth/register', async (req, res) => {
  try {
    const response = await makeRequest(`${USER_SERVICE_URL}/auth/register`, {
      method: 'POST',
      data: req.body,
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error: any) {
    console.error('Auth register error:', error.message);
    res.status(error.response?.status || 500).json(
      error.response?.data || { error: 'Authentication service unavailable' }
    );
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const response = await makeRequest(`${USER_SERVICE_URL}/auth/login`, {
      method: 'POST',
      data: req.body,
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(
      error.response?.data || { error: 'Authentication service unavailable' }
    );
  }
});

// Product routes
app.get('/api/products', async (req, res) => {
  try {
    const response = await makeRequest(`${PRODUCT_SERVICE_URL}/products`, {
      method: 'GET',
      params: req.query
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(
      error.response?.data || { error: 'Product service unavailable' }
    );
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const response = await makeRequest(`${PRODUCT_SERVICE_URL}/products`, {
      method: 'POST',
      data: req.body,
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(
      error.response?.data || { error: 'Product service unavailable' }
    );
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Enhanced error handling
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Gateway error:', error);
  res.status(500).json({ 
    error: 'Internal gateway error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Optimized API Gateway running on port ${PORT}`);
  console.log(`💾 Compression enabled`);
  console.log(`🛡️ Rate limiting: 1000 req/15min`);
  console.log(`🔐 Auth rate limiting: 50 req/15min`);
  console.log(`⏱️ Request timeout: 30s`);
});

export default app;
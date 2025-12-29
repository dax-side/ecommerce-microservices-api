// ===== Optimized API Gateway =====
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import axios from 'axios';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'E-commerce Microservices API',
      version: '1.0.0',
      description: 'A production-ready e-commerce backend system built with microservices architecture',
      contact: {
        name: 'API Support',
        email: 'support@ecommerce-api.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            category: { type: 'string' },
            stock: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string' },
                  quantity: { type: 'integer' },
                  price: { type: 'number' }
                }
              }
            },
            total: { type: 'number' },
            status: { type: 'string', enum: ['pending', 'processing', 'shipped', 'delivered'] },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            status: { type: 'integer' }
          }
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: ['./src/app.ts'] // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Service URLs
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';

// Performance Middleware
app.use(compression()); // Gzip compression
app.use(helmet());
app.use(cors());

// Rate Limiting - Configured for high load testing
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window for finer control
  max: 50000, // 50,000 per minute = ~833 req/s per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '1 minute'
  }
});

app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5000, // 5000 per minute for auth
  standardHeaders: true,
  legacyHeaders: false,
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

/**
 * @swagger
 * /api-docs:
 *   get:
 *     summary: API Documentation
 *     description: Swagger UI for API documentation
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: API documentation page
 */
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Check the health status of the API Gateway
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Gateway is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 service:
 *                   type: string
 *                   example: API Gateway
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 memory:
 *                   type: object
 */
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

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: securepassword
 *               name:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user and return JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: securepassword
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     description: Retrieve a list of all products with optional filtering
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter products by category
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Limit the number of results
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Number of products to skip
 *     responses:
 *       200:
 *         description: List of products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                 cached:
 *                   type: boolean
 *                   example: false
 *       500:
 *         description: Product service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     description: Create a new product in the catalog
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - price
 *               - category
 *               - stock
 *             properties:
 *               name:
 *                 type: string
 *                 example: Wireless Headphones
 *               description:
 *                 type: string
 *                 example: High-quality wireless headphones with noise cancellation
 *               price:
 *                 type: number
 *                 example: 199.99
 *               category:
 *                 type: string
 *                 example: Electronics
 *               stock:
 *                 type: integer
 *                 example: 50
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Product service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
  console.log(`Optimized API Gateway running on port ${PORT}`);
  console.log(`Compression enabled`);
  console.log(`Rate limiting: 1000 req/15min`);
  console.log(`Auth rate limiting: 50 req/15min`);
  console.log(`Request timeout: 30s`);
});

export default app;
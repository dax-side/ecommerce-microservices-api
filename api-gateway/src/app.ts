import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Service URLs
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Gateway health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'API Gateway',
    timestamp: new Date().toISOString()
  });
});

// Auth routes - proxy to User Service
app.post('/api/auth/register', async (req, res) => {
  try {
    const response = await axios.post(`${USER_SERVICE_URL}/auth/register`, req.body);
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const response = await axios.post(`${USER_SERVICE_URL}/auth/login`, req.body);
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

app.get('/api/auth/profile', async (req, res) => {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/auth/profile`, {
      headers: { authorization: req.headers.authorization }
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

// Product routes - proxy to Product Service
app.get('/api/products', async (req, res) => {
  try {
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/products`);
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const response = await axios.post(`${PRODUCT_SERVICE_URL}/products`, req.body);
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/products/${req.params.id}`);
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

// Category routes - proxy to Product Service
app.get('/api/categories', async (req, res) => {
  try {
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/categories`);
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const response = await axios.post(`${PRODUCT_SERVICE_URL}/categories`, req.body);
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

// Order routes - proxy to Order Service
app.get('/api/orders', async (req, res) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/orders`);
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const response = await axios.post(`${ORDER_SERVICE_URL}/orders`, req.body);
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Service unavailable' });
  }
});

// API documentation
app.get('/api', (req, res) => {
  res.json({
    message: 'E-commerce Microservices API Gateway',
    version: '1.0.0',
    endpoints: {
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'GET /api/auth/profile'
      ],
      products: [
        'GET /api/products',
        'GET /api/products/:id',
        'POST /api/products'
      ],
      categories: [
        'GET /api/categories',
        'POST /api/categories'
      ],
      orders: [
        'GET /api/orders',
        'POST /api/orders'
      ]
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
  console.log(`💚 Gateway Health: http://localhost:${PORT}/health`);
  console.log('\n🎯 Available Routes:');
  console.log('   POST /api/auth/register');
  console.log('   POST /api/auth/login');
  console.log('   GET  /api/products');
  console.log('   POST /api/products');
  console.log('   GET  /api/categories');
  console.log('   POST /api/categories');
  console.log('   GET  /api/orders');
  console.log('   POST /api/orders');
});

export default app;
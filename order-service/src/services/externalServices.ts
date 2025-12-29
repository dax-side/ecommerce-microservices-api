// ===== Optimized External Services with Circuit Breaker & Parallel Execution =====
import axios, { AxiosInstance } from 'axios';
import CircuitBreaker from 'opossum';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

// ===== HTTP Client with Connection Pooling =====
const httpClient: AxiosInstance = axios.create({
  timeout: 5000,
  httpAgent: new (require('http').Agent)({ 
    keepAlive: true,
    maxSockets: 50,        // Max concurrent connections per host
    maxFreeSockets: 10,    // Keep 10 sockets open for reuse
    timeout: 60000,        // Socket timeout
  }),
  headers: {
    'Connection': 'keep-alive'
  }
});

// ===== Circuit Breaker Configuration =====
const circuitBreakerOptions = {
  timeout: 5000,           // If request takes longer than 5s, trigger failure
  errorThresholdPercentage: 50, // When 50% of requests fail, open circuit
  resetTimeout: 30000,     // After 30s, try again
  volumeThreshold: 10,     // Minimum 10 requests before tripping
};

// ===== User Service Circuit Breaker =====
const validateUserFn = async (userId: string): Promise<boolean> => {
  const response = await httpClient.get(`${USER_SERVICE_URL}/auth/profile`, {
    headers: { 'user-id': userId }
  });
  return response.status === 200;
};

export const userServiceBreaker = new CircuitBreaker(validateUserFn, {
  ...circuitBreakerOptions,
  name: 'userService'
});

userServiceBreaker.on('open', () => console.warn('🔴 User Service circuit OPENED'));
userServiceBreaker.on('halfOpen', () => console.info('🟡 User Service circuit HALF-OPEN'));
userServiceBreaker.on('close', () => console.info('🟢 User Service circuit CLOSED'));

export const validateUser = async (userId: string): Promise<boolean> => {
  try {
    return await userServiceBreaker.fire(userId);
  } catch (error) {
    console.error('User validation error:', error);
    return false;
  }
};

// ===== Product Service Circuit Breaker =====
const getProductFn = async (productId: string) => {
  const response = await httpClient.get(`${PRODUCT_SERVICE_URL}/products/${productId}`);
  return response.data.product;
};

export const productServiceBreaker = new CircuitBreaker(getProductFn, {
  ...circuitBreakerOptions,
  name: 'productService'
});

productServiceBreaker.on('open', () => console.warn('🔴 Product Service circuit OPENED'));
productServiceBreaker.on('halfOpen', () => console.info('🟡 Product Service circuit HALF-OPEN'));
productServiceBreaker.on('close', () => console.info('🟢 Product Service circuit CLOSED'));

export const getProduct = async (productId: string) => {
  try {
    return await productServiceBreaker.fire(productId);
  } catch (error) {
    console.error('Product fetch error:', error);
    throw new Error(`Product not found: ${productId}`);
  }
};

// ===== PARALLEL Product Validation (Major Performance Improvement) =====
// Changed from sequential loop to Promise.all for 10x faster validation
export const validateProductsParallel = async (
  items: Array<{ productId: string; quantity: number }>
) => {
  // Fetch all products in PARALLEL instead of sequentially
  const productPromises = items.map(async (item) => {
    const product = await getProduct(item.productId);
    
    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
    }
    
    return {
      productId: product._id,
      productName: product.name,
      quantity: item.quantity,
      price: product.price
    };
  });
  
  // Wait for all products to be validated concurrently
  const validatedItems = await Promise.all(productPromises);
  
  return validatedItems;
};

// ===== Legacy Sequential Validation (kept for backwards compatibility) =====
export const validateProducts = async (items: Array<{productId: string, quantity: number}>) => {
  console.warn('⚠️ Using sequential validation - consider using validateProductsParallel for better performance');
  const validatedItems = [];
  
  for (const item of items) {
    const product = await getProduct(item.productId);
    
    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for ${product.name}`);
    }
    
    validatedItems.push({
      productId: product._id,
      productName: product.name,
      quantity: item.quantity,
      price: product.price
    });
  }
  
  return validatedItems;
};

// ===== Circuit Breaker Status for Health Checks =====
export const getCircuitStatus = () => ({
  userService: {
    state: userServiceBreaker.status.stats,
    isOpen: userServiceBreaker.opened,
    isClosed: userServiceBreaker.closed
  },
  productService: {
    state: productServiceBreaker.status.stats,
    isOpen: productServiceBreaker.opened,
    isClosed: productServiceBreaker.closed
  }
});

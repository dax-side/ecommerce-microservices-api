import axios from 'axios';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

export const validateUser = async (userId: string): Promise<boolean> => {
  try {
    const response = await axios.get(`${USER_SERVICE_URL}/auth/profile`, {
      headers: {
        'user-id': userId // Simple approach for demo
      }
    });
    return response.status === 200;
  } catch (error) {
    console.error('User validation error:', error);
    return false;
  }
};

export const getProduct = async (productId: string) => {
  try {
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/products/${productId}`);
    return response.data.product;
  } catch (error) {
    console.error('Product fetch error:', error);
    throw new Error('Product not found');
  }
};

export const validateProducts = async (items: Array<{productId: string, quantity: number}>) => {
  const validatedItems = [];
  
  for (const item of items) {
    try {
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
    } catch (error) {
      throw error;
    }
  }
  
  return validatedItems;
};

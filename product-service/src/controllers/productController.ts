// ===== Optimized Product Controller with Caching =====
import { Request, Response } from 'express';
import { Product } from '../models/Product';
import { cache } from '../cache/redis';

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const cacheKey = 'products:all';
    
    // Try cache first
    const cachedProducts = await cache.get(cacheKey);
    if (cachedProducts) {
      console.log('📦 Serving from cache');
      return res.json({ products: cachedProducts, cached: true });
    }
    
    // Fetch from database
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    
    // Cache for 5 minutes
    await cache.set(cacheKey, products, 300);
    
    console.log('🗄️ Serving from database');
    res.json({ products, cached: false });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `product:${id}`;
    
    // Try cache first
    const cachedProduct = await cache.get(cacheKey);
    if (cachedProduct) {
      return res.json({ product: cachedProduct, cached: true });
    }
    
    const product = await Product.findById(id).lean();
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Cache for 10 minutes
    await cache.set(cacheKey, product, 600);
    
    res.json({ product, cached: false });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, description, price, category, stock } = req.body;

    const product = new Product({
      name,
      description,
      price,
      category,
      stock
    });

    await product.save();
    
    // Invalidate cache
    await cache.del('products:all');
    await cache.del(`category:${category}`);

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
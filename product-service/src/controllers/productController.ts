// ===== Optimized Product Controller with Full Caching & Performance =====
import { Request, Response } from 'express';
import { Product } from '../models/Product';
import { cache } from '../cache/redis';

// Cache TTL constants (in seconds)
const CACHE_TTL = {
  ALL_PRODUCTS: 300,      // 5 minutes
  SINGLE_PRODUCT: 600,    // 10 minutes
  CATEGORY: 300,          // 5 minutes
};

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, category, search } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string) || 20, 100); // Max 100 items
    
    // Build cache key based on query params
    const cacheKey = `products:list:${pageNum}:${limitNum}:${category || 'all'}:${search || ''}`;
    
    // Try cache first
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, cached: true });
    }
    
    // Build query filter
    const filter: any = {};
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Parallel fetch for count and products
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(filter)
    ]);
    
    const result = {
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    };
    
    // Cache result
    await cache.set(cacheKey, result, CACHE_TTL.ALL_PRODUCTS);
    
    res.json({ ...result, cached: false });
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
    await cache.set(cacheKey, product, CACHE_TTL.SINGLE_PRODUCT);
    
    res.json({ product, cached: false });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProductsByCategory = async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    
    const cacheKey = `products:category:${category}:${pageNum}:${limitNum}`;
    
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, cached: true });
    }
    
    const [products, total] = await Promise.all([
      Product.find({ category })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Product.countDocuments({ category })
    ]);
    
    const result = {
      products,
      category,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    };
    
    await cache.set(cacheKey, result, CACHE_TTL.CATEGORY);
    
    res.json({ ...result, cached: false });
  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, description, price, category, stock } = req.body;

    // Validation
    if (!name || !description || price === undefined || !category) {
      return res.status(400).json({ error: 'Missing required fields: name, description, price, category' });
    }

    const product = new Product({
      name,
      description,
      price,
      category,
      stock: stock || 0
    });

    await product.save();
    
    // Invalidate related caches using pattern matching
    await invalidateProductCaches(category);

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const oldCategory = product.category;
    const updatedProduct = await Product.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).lean();
    
    // Invalidate caches
    await cache.del(`product:${id}`);
    await invalidateProductCaches(oldCategory);
    if (updates.category && updates.category !== oldCategory) {
      await invalidateProductCaches(updates.category);
    }

    res.json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Invalidate caches
    await cache.del(`product:${id}`);
    await invalidateProductCaches(product.category);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper to invalidate product list caches
async function invalidateProductCaches(category?: string) {
  try {
    // Use Redis SCAN to find and delete matching keys (more efficient than KEYS)
    await cache.delPattern('products:list:*');
    if (category) {
      await cache.delPattern(`products:category:${category}:*`);
      await cache.del(`category:${category}`);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}
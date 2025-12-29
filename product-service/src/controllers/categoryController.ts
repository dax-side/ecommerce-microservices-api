// ===== Optimized Category Controller with Caching =====
import { Request, Response } from 'express';
import { Category } from '../models/Category';
import { cache } from '../cache/redis';

const CACHE_TTL = {
  ALL_CATEGORIES: 600,    // 10 minutes - categories change less frequently
  SINGLE_CATEGORY: 900,   // 15 minutes
};

export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const cacheKey = 'categories:all';
    
    // Try cache first
    const cachedCategories = await cache.get(cacheKey);
    if (cachedCategories) {
      return res.json({ categories: cachedCategories, cached: true });
    }
    
    const categories = await Category.find().sort({ name: 1 }).lean();
    
    // Cache for 10 minutes
    await cache.set(cacheKey, categories, CACHE_TTL.ALL_CATEGORIES);
    
    res.json({ categories, cached: false });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `category:${id}`;
    
    const cachedCategory = await cache.get(cacheKey);
    if (cachedCategory) {
      return res.json({ category: cachedCategory, cached: true });
    }
    
    const category = await Category.findById(id).lean();
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    await cache.set(cacheKey, category, CACHE_TTL.SINGLE_CATEGORY);
    
    res.json({ category, cached: false });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const category = new Category({ name, description });
    await category.save();
    
    // Invalidate categories list cache
    await cache.del('categories:all');

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (name) {
      const existingCategory = await Category.findOne({ name, _id: { $ne: id } });
      if (existingCategory) {
        return res.status(400).json({ error: 'Category name already exists' });
      }
    }

    const category = await Category.findByIdAndUpdate(
      id,
      { name, description },
      { new: true, runValidators: true }
    ).lean();
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Invalidate caches
    await cache.del('categories:all');
    await cache.del(`category:${id}`);

    res.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const category = await Category.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Invalidate caches
    await cache.del('categories:all');
    await cache.del(`category:${id}`);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

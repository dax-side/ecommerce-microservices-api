// ===== Optimized Order Controller with Caching & Performance =====
import { Request, Response } from 'express';
import { Order } from '../models/Order';
import { validateProductsParallel } from '../services/externalServices';
import { cache } from '../cache/redis';

const CACHE_TTL = {
  USER_ORDERS: 120,       // 2 minutes - orders change more frequently
  SINGLE_ORDER: 300,      // 5 minutes
  ALL_ORDERS: 60,         // 1 minute - admin view, needs freshness
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    const { userId, items } = req.body;

    if (!userId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid order data: userId and items are required' });
    }

    // Validate products in PARALLEL (major performance improvement)
    const validatedItems = await validateProductsParallel(items);
    const totalAmount = validatedItems.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);

    // Create order
    const order = new Order({
      userId,
      items: validatedItems,
      totalAmount,
      status: 'pending'
    });

    await order.save();
    
    // Invalidate user's orders cache
    await cache.del(`orders:user:${userId}`);
    await cache.delPattern('orders:all:*');

    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
};

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const { userId, status, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    
    // Build cache key
    const cacheKey = `orders:all:${userId || 'all'}:${status || 'all'}:${pageNum}:${limitNum}`;
    
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, cached: true });
    }
    
    // Build filter
    const filter: any = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter)
    ]);
    
    const result = {
      orders,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    };
    
    await cache.set(cacheKey, result, CACHE_TTL.ALL_ORDERS);
    
    res.json({ ...result, cached: false });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getOrdersByUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string) || 20, 50);
    
    const cacheKey = `orders:user:${userId}:${pageNum}:${limitNum}`;
    
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return res.json({ ...cachedData, cached: true });
    }
    
    const [orders, total] = await Promise.all([
      Order.find({ userId })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Order.countDocuments({ userId })
    ]);
    
    const result = {
      orders,
      userId,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    };
    
    await cache.set(cacheKey, result, CACHE_TTL.USER_ORDERS);
    
    res.json({ ...result, cached: false });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `order:${id}`;
    
    const cachedOrder = await cache.get(cacheKey);
    if (cachedOrder) {
      return res.json({ order: cachedOrder, cached: true });
    }
    
    const order = await Order.findById(id).lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    await cache.set(cacheKey, order, CACHE_TTL.SINGLE_ORDER);

    res.json({ order, cached: false });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const order = await Order.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).lean();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Invalidate caches
    await cache.del(`order:${id}`);
    await cache.del(`orders:user:${order.userId}`);
    await cache.delPattern('orders:all:*');

    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getOrderItems = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `order:${id}:items`;
    
    const cachedItems = await cache.get(cacheKey);
    if (cachedItems) {
      return res.json({ items: cachedItems, cached: true });
    }
    
    const order = await Order.findById(id).select('items').lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    await cache.set(cacheKey, order.items, CACHE_TTL.SINGLE_ORDER);

    res.json({ items: order.items, cached: false });
  } catch (error) {
    console.error('Get order items error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const cancelOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Only allow cancellation of pending or confirmed orders
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot cancel order in current status' });
    }
    
    order.status = 'cancelled';
    await order.save();
    
    // Invalidate caches
    await cache.del(`order:${id}`);
    await cache.del(`orders:user:${order.userId}`);
    await cache.delPattern('orders:all:*');

    res.json({
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

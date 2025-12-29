import express from 'express';
import { 
  getAllOrders, 
  getOrderById,
  createOrder,
  updateOrderStatus,
  getOrderItems,
  getOrdersByUser,
  cancelOrder
} from '../controllers/orderController';

const router = express.Router();

// GET all orders with optional userId filter and caching
router.get('/', getAllOrders);

// GET orders by user ID
router.get('/user/:userId', getOrdersByUser);

// GET single order by ID
router.get('/:id', getOrderById);

// GET order items
router.get('/:id/items', getOrderItems);

// POST create new order
router.post('/', createOrder);

// PATCH update order status
router.patch('/:id/status', updateOrderStatus);

// DELETE cancel order
router.delete('/:id', cancelOrder);

export default router;

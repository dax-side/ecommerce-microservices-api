import express from 'express';
import { 
  getAllProducts, 
  getProductById, 
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory
} from '../controllers/productController';

const router = express.Router();

// GET all products with caching
router.get('/', getAllProducts);

// GET products by category
router.get('/category/:category', getProductsByCategory);

// GET single product by ID
router.get('/:id', getProductById);

// POST create new product
router.post('/', createProduct);

// PUT update product
router.put('/:id', updateProduct);

// DELETE product
router.delete('/:id', deleteProduct);

export default router;
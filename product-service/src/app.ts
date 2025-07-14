import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import productRoutes from './routes/products';
import categoryRoutes from './routes/categories';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Product Service' });
});

// Routes
app.use('/products', productRoutes);
app.use('/categories', categoryRoutes);

// Connect to MongoDB and start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Product Service running on port ${PORT}`);
    console.log('Available routes:');
    console.log('GET /health');
    console.log('GET /products');
    console.log('POST /products');
    console.log('GET /categories');
    console.log('POST /categories');
  });
}).catch(error => {
  console.error('Failed to connect to database:', error);
});

export default app;
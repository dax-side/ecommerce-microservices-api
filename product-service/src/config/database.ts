// ===== Optimized Database Configuration for 500+ Concurrent Users =====
import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URL!, {
      // ===== Connection Pool Optimization for High Concurrency =====
      maxPoolSize: 50,          // Increased from 10 to handle 500 users
      minPoolSize: 20,          // Increased from 5 for faster response
      maxIdleTimeMS: 30000,     // Close idle connections after 30s
      serverSelectionTimeoutMS: 5000, // Server selection timeout
      socketTimeoutMS: 45000,   // Socket timeout
      connectTimeoutMS: 10000,  // Connection timeout
      
      // Reliability & Performance
      retryWrites: true,
      retryReads: true,
      
      // Write concern for better performance (sacrifice some durability)
      w: 'majority',
      wtimeoutMS: 2500,
    });
    
    console.log(`[OK] MongoDB Connected: ${conn.connection.host}`);
    console.log(`[INFO] Connection Pool - Min: 20, Max: 50`);
    
    // Monitor connection events
    mongoose.connection.on('connected', () => {
      console.log('[OK] Mongoose connected to DB');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('[ERROR] Mongoose connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('[WARN] Mongoose disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('[ERROR] Database connection error:', error);
    process.exit(1);
  }
};
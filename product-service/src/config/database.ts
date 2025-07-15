// ===== Optimized src/config/database.ts for ALL services =====
import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URL!, {
      // Connection Pool Optimization
      maxPoolSize: 10,          // Maintain up to 10 socket connections
      minPoolSize: 5,           // Maintain minimum 5 connections
      maxIdleTimeMS: 30000,     // Close connections after 30 seconds of inactivity
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000,   // Close sockets after 45 seconds of inactivity
      
      // Reliability
      retryWrites: true,
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Connection Pool - Min: 5, Max: 10`);
    
    // Monitor connection events
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to DB');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('Mongoose disconnected');
    });
    
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};
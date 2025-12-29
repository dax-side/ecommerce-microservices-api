import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    index: true  // Single field index for category filtering
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  }
}, {
  timestamps: true
});

// ===== Performance Indexes =====
// Compound index for category + createdAt (common query pattern)
productSchema.index({ category: 1, createdAt: -1 });

// Text index for search functionality
productSchema.index({ name: 'text', description: 'text' });

// Index for sorting by creation date
productSchema.index({ createdAt: -1 });

// Index for price range queries
productSchema.index({ price: 1 });

// Compound index for stock queries (find in-stock products)
productSchema.index({ stock: 1, category: 1 });

export const Product = mongoose.model<IProduct>('Product', productSchema);

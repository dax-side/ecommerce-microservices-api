import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface IOrder extends Document {
  userId: string;
  items: IOrderItem[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>({
  productId: {
    type: String,
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
});

const orderSchema = new Schema<IOrder>({
  userId: {
    type: String,
    required: true,
    index: true  // Single field index for user order lookups
  },
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
    index: true  // Single field index for status filtering
  }
}, {
  timestamps: true
});

// ===== Performance Indexes =====
// Compound index for user orders sorted by date (most common query)
orderSchema.index({ userId: 1, createdAt: -1 });

// Compound index for status + date (admin filtering)
orderSchema.index({ status: 1, createdAt: -1 });

// Compound index for user + status (user's pending/shipped orders)
orderSchema.index({ userId: 1, status: 1 });

// Index for date range queries
orderSchema.index({ createdAt: -1 });

// Index for total amount (analytics, filtering by order value)
orderSchema.index({ totalAmount: -1 });

export const Order = mongoose.model<IOrder>('Order', orderSchema);

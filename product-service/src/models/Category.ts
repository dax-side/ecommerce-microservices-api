import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>({
  name: {
    type: String,
    required: true,
    unique: true,  // This automatically creates an index
    trim: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// ===== Performance Indexes =====
// Index for sorting by name (alphabetical listing)
categorySchema.index({ name: 1 });

// Index for creation date (recent categories)
categorySchema.index({ createdAt: -1 });

export const Category = mongoose.model<ICategory>('Category', categorySchema);

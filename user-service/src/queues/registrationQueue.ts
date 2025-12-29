// ===== Bull Queue for Async Registration Processing =====
// Heavy operations like bcrypt hashing can be offloaded to background workers
// This allows the API to respond quickly while processing happens asynchronously

import Bull from 'bull';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { cache } from '../cache/redis';

const BCRYPT_ROUNDS = 8;
const REDIS_URL = `redis://${process.env.REDIS_HOST || 'localhost'}:6379`;

// Create registration queue
export const registrationQueue = new Bull('registration', REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 100,  // Keep last 100 completed jobs
    removeOnFail: 50,       // Keep last 50 failed jobs
    attempts: 3,            // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 1000           // Start with 1s delay, then 2s, then 4s
    }
  },
  limiter: {
    max: 50,                // Max 50 jobs per duration
    duration: 1000          // Per second
  }
});

// Process registration jobs
registrationQueue.process('register', 5, async (job) => {
  const { email, password, name, requestId } = job.data;
  
  console.log(`[Queue] Processing registration for ${email} (Request: ${requestId})`);
  
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() }).lean();
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password (CPU-intensive operation now in background)
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user
    const user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      name
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    // Cache user profile
    const userProfile = {
      id: user._id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    };
    
    await cache.set(`user:profile:${user._id}`, userProfile, 300);
    await cache.set(`user:email:${email.toLowerCase()}`, { exists: true, userId: user._id }, 300);

    // Store result for retrieval
    const result = {
      success: true,
      message: 'User created successfully',
      token,
      user: userProfile
    };
    
    await cache.set(`registration:result:${requestId}`, result, 300);
    
    console.log(`[Queue] Registration completed for ${email}`);
    return result;
  } catch (error: any) {
    console.error(`[Queue] Registration failed for ${email}:`, error.message);
    
    // Store error result
    await cache.set(`registration:result:${requestId}`, {
      success: false,
      error: error.message
    }, 300);
    
    throw error;
  }
});

// Queue event listeners
registrationQueue.on('completed', (job, result) => {
  console.log(`[Queue] Job ${job.id} completed for ${job.data.email}`);
});

registrationQueue.on('failed', (job, err) => {
  console.error(`[Queue] Job ${job?.id} failed:`, err.message);
});

registrationQueue.on('stalled', (job) => {
  console.warn(`[Queue] Job ${job.id} stalled`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Queue] Shutting down registration queue...');
  await registrationQueue.close();
});

// Export queue stats function
export const getQueueStats = async () => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    registrationQueue.getWaitingCount(),
    registrationQueue.getActiveCount(),
    registrationQueue.getCompletedCount(),
    registrationQueue.getFailedCount(),
    registrationQueue.getDelayedCount()
  ]);
  
  return { waiting, active, completed, failed, delayed };
};

export default registrationQueue;

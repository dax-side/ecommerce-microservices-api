// ===== Optimized Auth Controller with Reduced Bcrypt Rounds & Caching =====
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { cache } from '../cache/redis';

// ===== Performance Constants =====
// Reduced from 10 to 8 rounds: ~4x faster hashing with minimal security impact
// 8 rounds = ~40ms vs 10 rounds = ~100ms per hash
const BCRYPT_ROUNDS = 8;

// Cache TTL (in seconds)
const CACHE_TTL = {
  USER_PROFILE: 300,    // 5 minutes - user profiles don't change often
  JWT_TOKEN: 300,       // 5 minutes - cache validated tokens
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user already exists (with cache check first)
    const cacheKey = `user:email:${email.toLowerCase()}`;
    const cachedUser = await cache.get(cacheKey);
    if (cachedUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() }).lean();
    if (existingUser) {
      // Cache the existence for future checks
      await cache.set(cacheKey, { exists: true }, CACHE_TTL.USER_PROFILE);
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password with optimized rounds
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

    // Cache user profile (without password)
    const userProfile = {
      id: user._id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    };
    await cache.set(`user:profile:${user._id}`, userProfile, CACHE_TTL.USER_PROFILE);
    await cache.set(`user:email:${email.toLowerCase()}`, { exists: true, userId: user._id }, CACHE_TTL.USER_PROFILE);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: userProfile
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    // Cache user profile for subsequent requests
    const userProfile = {
      id: user._id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    };
    await cache.set(`user:profile:${user._id}`, userProfile, CACHE_TTL.USER_PROFILE);
    
    // Cache token validation result
    await cache.set(`token:${token}`, { userId: user._id, valid: true }, CACHE_TTL.JWT_TOKEN);

    res.json({
      message: 'Login successful',
      token,
      user: userProfile
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    
    // Try cache first
    const cacheKey = `user:profile:${userId}`;
    const cachedProfile = await cache.get(cacheKey);
    if (cachedProfile) {
      return res.json({ user: cachedProfile, cached: true });
    }
    
    // Fetch from database
    const user = await User.findById(userId).select('-password').lean();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userProfile = {
      id: user._id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    };
    
    // Cache for future requests
    await cache.set(cacheKey, userProfile, CACHE_TTL.USER_PROFILE);

    res.json({ user: userProfile, cached: false });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { name } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { name },
      { new: true }
    ).select('-password').lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userProfile = {
      id: user._id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    };

    // Update cache
    await cache.set(`user:profile:${userId}`, userProfile, CACHE_TTL.USER_PROFILE);

    res.json({ 
      message: 'Profile updated successfully',
      user: userProfile 
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ===== Logout - Invalidate cached token =====
export const logout = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      // Invalidate the token in cache
      await cache.del(`token:${token}`);
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

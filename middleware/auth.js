const jwt = require('jsonwebtoken');
const { supabase } = require('../config/database');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.',
        hint: 'Please include Authorization header with Bearer token' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);
      return res.status(401).json({ 
        error: 'Invalid token.',
        hint: 'Token may be expired or malformed' 
      });
    }

    // Verify user exists in database
    const { data: user, error } = await supabase
      .from('staff')
      .select('*')
      .eq('id', decoded.userId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Database error in auth middleware:', error);
      return res.status(401).json({ 
        error: 'Invalid token.',
        hint: 'User not found or inactive' 
      });
    }

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid token.',
        hint: 'User not found or inactive' 
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      error: 'Internal server error in authentication',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.',
        required: roles,
        current: req.user.role
      });
    }
    
    next();
  };
};

module.exports = { authMiddleware, requireRole };
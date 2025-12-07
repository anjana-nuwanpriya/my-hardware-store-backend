const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ========================
// LOGIN ENDPOINT
// ========================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    console.log(`🔐 Login attempt for: ${email}`);

    // Find user in staff table
    const { data: users, error: queryError } = await supabase
      .from('staff')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (queryError || !users) {
      console.error('❌ User not found:', queryError?.message);
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }

    // Check if password_hash exists
    if (!users.password_hash) {
      console.error('❌ No password hash for user:', email);
      return res.status(401).json({ 
        error: 'Account not properly configured. Please contact administrator.' 
      });
    }

    // Verify password using bcrypt
    const validPassword = await bcrypt.compare(password, users.password_hash);

    if (!validPassword) {
      console.error('❌ Invalid password for:', email);
      return res.status(401).json({ 
        error: 'Invalid email or password' 
      });
    }

    // Update last login time
    await supabase
      .from('staff')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', users.id);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: users.id, 
        email: users.email, 
        role: users.role 
      },
      process.env.JWT_SECRET || 'your-secret-key-change-this',
      { expiresIn: '7d' }
    );

    console.log(`✅ Login successful for: ${email}`);

    // Send response
    res.json({
      token,
      user: {
        id: users.id,
        email: users.email,
        firstName: users.first_name,
        lastName: users.last_name,
        fullName: `${users.first_name} ${users.last_name}`,
        role: users.role,
        permissions: users.permissions || []
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ 
      error: 'Server error during login',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========================
// REGISTER ENDPOINT
// ========================
router.post('/register', async (req, res) => {
  try {
    const { employeeId, firstName, lastName, email, role, password } = req.body;

    // Validate input
    if (!email || !firstName || !lastName || !role || !password) {
      return res.status(400).json({ 
        error: 'All fields are required: email, firstName, lastName, role, password' 
      });
    }

    console.log(`📝 Register attempt for: ${email}`);

    // Check if email already exists
    const { data: existingUsers } = await supabase
      .from('staff')
      .select('id')
      .eq('email', email);

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({ 
        error: 'Email already registered' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create staff member
    const { data: newUser, error: insertError } = await supabase
      .from('staff')
      .insert([{
        employee_id: employeeId || null,
        first_name: firstName,
        last_name: lastName,
        email,
        role,
        password_hash,
        is_active: true
      }])
      .select()
      .single();

    if (insertError) {
      console.error('❌ Register error:', insertError.message);
      return res.status(400).json({ 
        error: insertError.message 
      });
    }

    console.log(`✅ User registered: ${email}`);

    res.status(201).json({ 
      message: 'Staff member created successfully', 
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error.message);
    res.status(500).json({ 
      error: 'Server error during registration',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========================
// VERIFY TOKEN ENDPOINT
// ========================
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'No token provided' 
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'your-secret-key-change-this'
      );
    } catch (jwtError) {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: jwtError.message
      });
    }

    // Get fresh user data from Supabase
    const { data: user, error } = await supabase
      .from('staff')
      .select('id, email, first_name, last_name, role, permissions, is_active')
      .eq('id', decoded.userId)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      console.error('❌ User verification failed:', error?.message);
      return res.status(401).json({ 
        error: 'User not found or inactive' 
      });
    }

    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`,
        role: user.role,
        permissions: user.permissions || []
      }
    });

  } catch (error) {
    console.error('❌ Token verification error:', error.message);
    res.status(401).json({ 
      error: 'Token verification failed',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========================
// CHANGE PASSWORD ENDPOINT
// ========================
router.post('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    let decoded;
    try {
      decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'your-secret-key-change-this'
      );
    } catch (jwtError) {
      return res.status(401).json({ 
        error: 'Invalid token' 
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current password and new password are required'
      });
    }

    // Get current password hash
    const { data: user, error: getError } = await supabase
      .from('staff')
      .select('password_hash')
      .eq('id', decoded.userId)
      .single();

    if (getError || !user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isValid) {
      return res.status(401).json({
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await supabase
      .from('staff')
      .update({ password_hash: hashedPassword })
      .eq('id', decoded.userId);

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('❌ Change password error:', error.message);
    res.status(500).json({
      error: 'Failed to change password',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========================
// LOGOUT ENDPOINT (optional)
// ========================
router.post('/logout', (req, res) => {
  res.json({ 
    message: 'Logged out successfully' 
  });
});

module.exports = router;
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config();

const app = express();

// ✅ TRUST PROXY - Must be BEFORE rate limiting
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// =====================================================
// ROUTES - NO DATABASE IMPORT NEEDED IN SERVER.JS
// =====================================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/pos', require('./routes/pos'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/purchase-orders', require('./routes/purchaseOrders'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/promotions', require('./routes/promotions'));
app.use('/api/staff', require('./routes/staff'));

// New routes
app.use('/api/stores', require('./routes/stores'));
app.use('/api/opening-balances', require('./routes/openingBalances'));
app.use('/api/grn', require('./routes/grn'));
app.use('/api/purchase-returns', require('./routes/purchaseReturns'));
app.use('/api/supplier-payments', require('./routes/supplierPayments'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/stock-transfer', require('./routes/stockTransfer'));
app.use('/api/stock-adjustment', require('./routes/stockAdjustment'));
app.use('/api/customer-payments', require('./routes/customerPayments'));
app.use('/api/sales-returns', require('./routes/salesReturns'));
app.use('/api/financial', require('./routes/financial'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: '🔧 Hardware Shop Management System API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      masters: ['/api/products', '/api/customers', '/api/suppliers', '/api/categories', '/api/stores'],
      transactions: ['/api/orders', '/api/quotations', '/api/grn', '/api/purchase-returns', '/api/sales-returns'],
      payments: ['/api/supplier-payments', '/api/customer-payments'],
      financial: ['/api/financial/petty-cash', '/api/financial/general-receipts', '/api/financial/bank-entries'],
      inventory: '/api/inventory',
      pos: '/api/pos',
      reports: '/api/reports'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Hardware Shop API Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

module.exports = app;
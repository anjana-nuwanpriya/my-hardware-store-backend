// ================================
// server.js (FULL FIXED VERSION)
// ================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config();

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limit
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
}));

// Logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ========================
// ROUTES
// ========================

// Auth route
app.use('/api/auth', require('./routes/auth'));

// Master routes
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/items', require('./routes/Items'));

// =============================
// 🔥 Transaction routes
// =============================

// Opening Stock
app.use('/api/opening-stock', require('./routes/opening-stock'));

// Purchase Order
app.use('/api/purchase-orders', require('./routes/purchase-orders'));

// Sales Retail
app.use('/api/sales-retail', require('./routes/sales-retail'));

// Sales Wholesale  (THE ONE YOU NEED!)
app.use('/api/sales-wholesale', require('./routes/sales-wholesale'));

// =============================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: "OK", serverTime: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;

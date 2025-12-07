const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config();

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// ========================
// MIDDLEWARE
// ========================
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
// MASTER ROUTES
// ========================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/items', require('./routes/Items'));

// ========================
// OPENING BALANCE ROUTES
// ========================
app.use('/api/supplier-opening-balance', require('./routes/supplier-opening-balance'));
app.use('/api/customer-opening-balance', require('./routes/customer-opening-balance'));

// ========================
// INVENTORY ROUTES
// ========================
app.use('/api/opening-stock', require('./routes/opening-stock'));
app.use('/api/stock-adjustment', require('./routes/stock-adjustment'));
app.use('/api/item-dispatch-note', require('./routes/item-dispatch-note'));

// ========================
// PURCHASE ROUTES
// ========================
app.use('/api/purchase-orders', require('./routes/purchase-orders'));
app.use('/api/purchase-grn', require('./routes/purchase-grn'));
app.use('/api/purchase-return', require('./routes/purchase-return'));
app.use('/api/supplier-payments', require('./routes/supplier-payments'));

// ========================
// SALES ROUTES
// ========================
app.use('/api/sales-retail', require('./routes/sales-retail'));
app.use('/api/sales-wholesale', require('./routes/sales-wholesale'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/sales-return', require('./routes/sales-return'));
app.use('/api/sales-wholesale-return', require('./routes/sales-wholesale-return'));
app.use('/api/customer-payments', require('./routes/customer-payments'));

// ========================
// FINANCIAL ROUTES
// ========================
app.use('/api/petty-cash-voucher', require('./routes/petty-cash-voucher'));
app.use('/api/general-receipts', require('./routes/general-receipts'));
app.use('/api/bank-accounts', require('./routes/bank-accounts'));
app.use('/api/bank-entries', require('./routes/bank-entries'));

// ========================
// HEALTH CHECK
// ========================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: "OK", 
    serverTime: new Date().toISOString(),
    routes: {
      masters: "✅ Suppliers, Customers, Stores, Categories, Employees, Items",
      openingBalance: "✅ Supplier & Customer OP Balance",
      inventory: "✅ Opening Stock, Stock Adjustment, Item Dispatch",
      purchase: "✅ Purchase Order, GRN, Returns, Supplier Payments",
      sales: "✅ Sales Retail/Wholesale, Quotations, Returns, Customer Payments",
      financial: "✅ Petty Cash, General Receipts, Bank Accounts, Bank Entries"
    }
  });
});

// ========================
// 404 HANDLER
// ========================
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
    availableRoutes: {
      masters: "/api/suppliers, /api/customers, /api/stores, /api/categories, /api/employees, /api/items",
      openingBalance: "/api/supplier-opening-balance, /api/customer-opening-balance",
      inventory: "/api/opening-stock, /api/stock-adjustment, /api/item-dispatch-note",
      purchase: "/api/purchase-orders, /api/purchase-grn, /api/purchase-return, /api/supplier-payments",
      sales: "/api/sales-retail, /api/sales-wholesale, /api/quotations, /api/sales-return, /api/sales-wholesale-return, /api/customer-payments",
      financial: "/api/petty-cash-voucher, /api/general-receipts, /api/bank-accounts, /api/bank-entries"
    }
  });
});

// ========================
// GLOBAL ERROR HANDLER
// ========================
app.use((err, req, res, next) => {
  console.error("❌ Global error:", err.message);
  res.status(500).json({ 
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
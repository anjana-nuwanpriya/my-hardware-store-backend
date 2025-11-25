const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET - Dashboard Summary
router.get('/dashboard', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    // Total Sales
    const { data: salesData, error: salesError } = await supabase
      .from('orders')
      .select('total_amount')
      .in('status', ['completed', 'retail'])
      .gte('created_at', start_date || '2000-01-01')
      .lte('created_at', end_date || '2099-12-31');

    if (salesError) throw salesError;

    const totalSales = salesData.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);

    // Total Orders
    const { count: orderCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['completed', 'retail'])
      .gte('created_at', start_date || '2000-01-01')
      .lte('created_at', end_date || '2099-12-31');

    // Total Products
    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    // Low Stock Items
    const { data: lowStockItems } = await supabase
      .from('products')
      .select(`
        *,
        inventory (quantity_on_hand)
      `)
      .eq('is_active', true);

    const lowStock = lowStockItems.filter(p => {
      const stock = p.inventory?.[0]?.quantity_on_hand || 0;
      return stock <= p.min_stock_level && stock > 0;
    }).length;

    res.json({
      totalSales,
      totalOrders: orderCount || 0,
      totalProducts: productCount || 0,
      lowStockItems: lowStock
    });

  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET - Sales Report
router.get('/sales', async (req, res) => {
  try {
    const { start_date, end_date, group_by = 'day' } = req.query;

   const { data, error } = await supabase
  .from('orders')
  .select(`
    id,
    order_number,
    order_date,
    created_at,
    total_amount,
    payment_method,
    status,
    customers (first_name, last_name)
  `)
  .in('status', ['completed', 'retail'])
  .gte('created_at', start_date || '2000-01-01')
  .lte('created_at', end_date || '2099-12-31')
  .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ sales: data || [] });

  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET - Top Selling Products
router.get('/top-products', async (req, res) => {
  try {
    const { start_date, end_date, limit = 10 } = req.query;

    const { data, error } = await supabase
      .from('order_items')
      .select(`
        product_id,
        quantity,
        line_total,
        orders!inner (
          order_date,
          status
        )
      `)
      .eq('orders.status', 'completed')
      .gte('orders.order_date', start_date || '2000-01-01')
      .lte('orders.order_date', end_date || '2099-12-31');

    if (error) throw error;

    // Group by product
    const productMap = {};
    data.forEach(item => {
      if (!productMap[item.product_id]) {
        productMap[item.product_id] = {
          product_id: item.product_id,
          total_quantity: 0,
          total_revenue: 0
        };
      }
      productMap[item.product_id].total_quantity += item.quantity;
      productMap[item.product_id].total_revenue += parseFloat(item.line_total || 0);
    });

    // Get product details
    const productIds = Object.keys(productMap);
    const { data: products } = await supabase
      .from('products')
      .select('id, name, sku, selling_price')
      .in('id', productIds);

    const topProducts = products.map(product => ({
      ...product,
      ...productMap[product.id]
    })).sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, parseInt(limit));

    res.json({ topProducts });

  } catch (error) {
    console.error('Error fetching top products:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET - Inventory Report
router.get('/inventory', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        sku,
        name,
        cost_price,
        selling_price,
        min_stock_level,
        inventory (
          quantity_on_hand,
          quantity_reserved,
          quantity_available
        )
      `)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    const inventoryReport = data.map(product => {
      const stock = product.inventory?.[0]?.quantity_on_hand || 0;
      const value = stock * parseFloat(product.cost_price || 0);
      
      return {
        ...product,
        stock,
        value,
        status: stock === 0 ? 'Out of Stock' : 
                stock <= product.min_stock_level ? 'Low Stock' : 'In Stock'
      };
    });

    const totalValue = inventoryReport.reduce((sum, item) => sum + item.value, 0);

    res.json({ 
      inventory: inventoryReport,
      summary: {
        totalValue,
        totalProducts: inventoryReport.length,
        outOfStock: inventoryReport.filter(i => i.status === 'Out of Stock').length,
        lowStock: inventoryReport.filter(i => i.status === 'Low Stock').length
      }
    });

  } catch (error) {
    console.error('Error fetching inventory report:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET - Stock Movement History
router.get('/stock-movements', async (req, res) => {
  try {
    const { start_date, end_date, product_id } = req.query;

    let query = supabase
      .from('stock_movements')
      .select(`
        id,
        product_id,
        movement_type,
        quantity,
        reference_type,
        notes,
        created_at,
        products (name, sku)
      `)
      .gte('created_at', start_date || '2000-01-01')
      .lte('created_at', end_date || '2099-12-31')
      .order('created_at', { ascending: false });

    if (product_id) {
      query = query.eq('product_id', product_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ movements: data || [] });

  } catch (error) {
    console.error('Error fetching stock movements:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET - Payment Methods Breakdown
router.get('/payment-methods', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const { data, error } = await supabase
      .from('payments')
      .select(`
        payment_method,
        amount,
        created_at
      `)
      .gte('created_at', start_date || '2000-01-01')
      .lte('created_at', end_date || '2099-12-31');

    if (error) throw error;

    // Group by payment method
    const methodMap = {};
    data.forEach(payment => {
      const method = payment.payment_method || 'Unknown';
      if (!methodMap[method]) {
        methodMap[method] = {
          method,
          count: 0,
          total: 0
        };
      }
      methodMap[method].count += 1;
      methodMap[method].total += parseFloat(payment.amount || 0);
    });

    const breakdown = Object.values(methodMap);

    res.json({ paymentMethods: breakdown });

  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET - Profit & Loss Statement
router.get('/profit-loss', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    // Get completed orders with items
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        total_amount,
        order_date,
        order_items (
          quantity,
          unit_price,
          products (cost_price)
        )
      `)
      .in('status', ['completed', 'retail'])
 .gte('created_at', start_date || '2000-01-01')
.lte('created_at', end_date || '2099-12-31')

    if (error) throw error;

    let totalRevenue = 0;
    let totalCost = 0;

    orders.forEach(order => {
      totalRevenue += parseFloat(order.total_amount || 0);
      
      order.order_items.forEach(item => {
        const costPrice = parseFloat(item.products?.cost_price || 0);
        totalCost += costPrice * item.quantity;
      });
    });

    const grossProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    res.json({
      totalRevenue,
      totalCost,
      grossProfit,
      profitMargin: profitMargin.toFixed(2),
      orderCount: orders.length
    });

  } catch (error) {
    console.error('Error fetching profit & loss:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// Search products
router.get('/products/search', async (req, res) => {
  try {
    const { q } = req.query;

    const { data, error } = await supabase
      .from('products')
      .select(`id, sku, name, selling_price, barcode, inventory(quantity_available)`)
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.eq.${q}`)
      .eq('is_active', true)
      .limit(10);

    if (error) throw error;
    res.json({ products: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product by barcode
router.get('/products/barcode/:barcode', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`id, sku, name, selling_price, barcode, inventory(quantity_available)`)
      .eq('barcode', req.params.barcode)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🆕 COMPLETE SALE - This is the missing endpoint!
router.post('/complete-sale', async (req, res) => {
  try {
    const { items, payment_method, customer_id, notes } = req.body;

    console.log('🛒 Processing POS sale:', { items: items.length, payment_method });

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => 
      sum + (parseFloat(item.unit_price) * parseInt(item.quantity)), 0
    );

    // Generate order number
    const orderNumber = `ORD-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

    // Step 1: Create order in orders table
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        order_number: orderNumber,
        order_date: new Date().toISOString(),
        customer_id: customer_id || null,
        staff_id: req.user?.id || null,
        total_amount: subtotal,
        payment_method: payment_method || 'cash',
        status: 'completed',  // ← Set to completed so reports can find it!
        notes: notes || 'POS Sale',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (orderError) {
      console.error('❌ Error creating order:', orderError);
      throw orderError;
    }

    console.log('✅ Order created:', order.id, order.order_number);

    // Step 2: Create order items linked to the order
    const orderItems = items.map(item => ({
      order_id: order.id,  // ← Link to parent order!
      product_id: item.product_id,
      quantity: parseInt(item.quantity),
      unit_price: parseFloat(item.unit_price)
      // line_total is auto-calculated (generated column)
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('❌ Error creating order items:', itemsError);
      throw itemsError;
    }

    console.log('✅ Order items created:', orderItems.length);

    // Step 3: Create payment record
    const { error: paymentError } = await supabase
      .from('payments')
      .insert([{
        order_id: order.id,
        amount: subtotal,
        payment_method: payment_method || 'cash',
        created_at: new Date().toISOString()
      }]);

    if (paymentError) {
      console.error('❌ Error creating payment:', paymentError);
      // Don't fail the whole transaction for payment record
    } else {
      console.log('✅ Payment recorded');
    }

    // Step 4: Update inventory (reduce stock)
    for (const item of items) {
      // Get current stock
      const { data: inventory } = await supabase
        .from('inventory')
        .select('quantity_on_hand')
        .eq('product_id', item.product_id)
        .single();

      if (inventory) {
        const newStock = inventory.quantity_on_hand - parseInt(item.quantity);
        
        // Update stock
        await supabase
          .from('inventory')
          .update({ 
            quantity_on_hand: newStock,
            updated_at: new Date().toISOString()
          })
          .eq('product_id', item.product_id);

        // Create stock movement record
        await supabase
          .from('stock_movements')
          .insert([{
            product_id: item.product_id,
            movement_type: 'sale',
            quantity: -parseInt(item.quantity),
            reference_type: 'order',
            reference_id: order.id,
            notes: `POS Sale - ${order.order_number}`,
            created_at: new Date().toISOString()
          }]);
      }
    }

    console.log('✅ Inventory updated');

    res.json({ 
      success: true, 
      order: {
        id: order.id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        payment_method: order.payment_method
      },
      message: 'Sale completed successfully'
    });

  } catch (error) {
    console.error('❌ Error completing sale:', error);
    res.status(500).json({ 
      error: 'Failed to complete sale: ' + error.message 
    });
  }
});

// Get shift summary
router.get('/shift-summary', async (req, res) => {
  try {
    const { staff_id } = req.query;
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('orders')
      .select('total_amount, payment_method')
      .eq('staff_id', staff_id || req.user?.id)
      .gte('order_date', today)
      .in('status', ['completed', 'retail']);

    if (error) throw error;

    const summary = {
      totalSales: data.reduce((sum, o) => sum + parseFloat(o.total_amount), 0),
      totalOrders: data.length,
      cashSales: data.filter(o => o.payment_method === 'cash')
        .reduce((sum, o) => sum + parseFloat(o.total_amount), 0),
      cardSales: data.filter(o => o.payment_method === 'card')
        .reduce((sum, o) => sum + parseFloat(o.total_amount), 0),
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
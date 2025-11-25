const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all orders
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customers(first_name, last_name, customer_number),
        staff(first_name, last_name)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ orders: data || [] });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single order with items
router.get('/:id', async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        customers(first_name, last_name, customer_number, phone),
        staff(first_name, last_name)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (orderError) throw orderError;

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        *,
        products(name, sku, barcode)
      `)
      .eq('order_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ ...order, items: items || [] });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Create new order
router.post('/', async (req, res) => {
  try {
    const { 
      customer_id, 
      staff_id, 
      items, 
      subtotal, 
      tax_amount, 
      discount_amount, 
      total_amount,
      payment_method,
      payment_status,
      notes 
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order must have at least one item' });
    }

    // Generate order number
    const { data: lastOrder } = await supabase
      .from('orders')
      .select('order_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let orderNumber = 'ORD-0001';
    if (lastOrder && lastOrder.order_number) {
      const lastNumber = parseInt(lastOrder.order_number.split('-')[1]);
      orderNumber = `ORD-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        order_number: orderNumber,
        customer_id,
        staff_id,
        order_type: 'pos',
        status: 'completed',
        order_date: new Date().toISOString(),
        subtotal,
        tax_amount: tax_amount || 0,
        discount_amount: discount_amount || 0,
        total_amount,
        payment_status: payment_status || 'paid',
        payment_method: payment_method || 'cash',
        notes,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (orderError) throw orderError;

    // Create order items
    const orderItems = items.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      discount_percentage: item.discount_percentage || 0,
      created_at: new Date().toISOString()
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Update inventory for each item
    for (const item of items) {
      const { data: inventory } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_id', item.product_id)
        .single();

      if (inventory) {
        await supabase
          .from('inventory')
          .update({
            quantity_on_hand: inventory.quantity_on_hand - item.quantity,
            updated_at: new Date().toISOString()
          })
          .eq('product_id', item.product_id);

        // Create stock movement
        await supabase
          .from('stock_movements')
          .insert([{
            product_id: item.product_id,
            movement_type: 'sale',
            quantity: -item.quantity,
            reference_type: 'order',
            reference_id: order.id,
            notes: `Sale - Order ${orderNumber}`,
            created_at: new Date().toISOString()
          }]);
      }
    }

    res.status(201).json({ 
      message: 'Order created successfully',
      order,
      order_number: orderNumber
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE order
router.delete('/:id', async (req, res) => {
  try {
    // Delete items first
    await supabase
      .from('order_items')
      .delete()
      .eq('order_id', req.params.id);

    // Delete order
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
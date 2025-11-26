const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all sales returns
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sales_return')
      .select(`
        *,
        customers(first_name, last_name, customer_number),
        stores(store_name),
        orders(order_number)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ returns: data || [] });
  } catch (error) {
    console.error('Error fetching sales returns:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single sales return with items
router.get('/:id', async (req, res) => {
  try {
    const { data: returnData, error: returnError } = await supabase
      .from('sales_return')
      .select(`
        *,
        customers(first_name, last_name, customer_number, phone),
        stores(store_name),
        orders(order_number)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (returnError) throw returnError;

    const { data: items, error: itemsError } = await supabase
      .from('sales_return_items')
      .select(`
        *,
        products(name, sku)
      `)
      .eq('return_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ ...returnData, items: items || [] });
  } catch (error) {
    console.error('Error fetching sales return:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create sales return
router.post('/', async (req, res) => {
  try {
    const {
      original_order_id,
      customer_id,
      store_id,
      return_date,
      return_type,
      items,
      reason,
      notes
    } = req.body;
    const user = req.user;

    if (!customer_id || !store_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer, store, and items are required' });
    }

    // Generate return number
    const { data: lastReturn } = await supabase
      .from('sales_return')
      .select('return_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let returnNumber = 'SR-0001';
    if (lastReturn && lastReturn.return_number) {
      const lastNumber = parseInt(lastReturn.return_number.split('-')[1]);
      returnNumber = `SR-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    // Calculate total
    const total = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);

    // Create sales return
    const { data: salesReturn, error: returnError } = await supabase
      .from('sales_return')
      .insert([{
        return_number: returnNumber,
        original_order_id,
        customer_id,
        store_id,
        return_date: return_date || new Date().toISOString().split('T')[0],
        return_type: return_type || 'retail',
        total_amount: total,
        reason,
        notes,
        created_by: user?.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (returnError) throw returnError;

    // Create return items
    const returnItems = items.map(item => ({
      return_id: salesReturn.id,
      product_id: item.product_id,
      quantity: parseFloat(item.quantity),
      rate: parseFloat(item.rate)
    }));

    const { error: itemsError } = await supabase
      .from('sales_return_items')
      .insert(returnItems);

    if (itemsError) throw itemsError;

    // Update item_stock - increase quantity (items coming back)
    for (const item of items) {
      const { data: existingStock } = await supabase
        .from('item_stock')
        .select('*')
        .eq('product_id', item.product_id)
        .eq('store_id', store_id)
        .single();

      if (existingStock) {
        await supabase
          .from('item_stock')
          .update({
            quantity: existingStock.quantity + parseFloat(item.quantity),
            last_updated: new Date().toISOString()
          })
          .eq('product_id', item.product_id)
          .eq('store_id', store_id);
      } else {
        await supabase
          .from('item_stock')
          .insert([{
            product_id: item.product_id,
            store_id,
            quantity: parseFloat(item.quantity),
            reserved_quantity: 0,
            last_updated: new Date().toISOString()
          }]);
      }

      // Create stock movement
      await supabase
        .from('stock_movements')
        .insert([{
          product_id: item.product_id,
          movement_type: 'sales_return',
          quantity: parseFloat(item.quantity),
          reference_type: 'sales_return',
          reference_id: salesReturn.id,
          notes: `Sales Return - ${returnNumber}`,
          created_at: new Date().toISOString()
        }]);
    }

    res.status(201).json({
      message: 'Sales return created successfully',
      return: salesReturn,
      return_number: returnNumber
    });

  } catch (error) {
    console.error('Error creating sales return:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE sales return
router.delete('/:id', async (req, res) => {
  try {
    await supabase
      .from('sales_return_items')
      .delete()
      .eq('return_id', req.params.id);

    const { error } = await supabase
      .from('sales_return')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Sales return deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all purchase returns
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purchase_return')
      .select(`
        *,
        suppliers(name),
        stores(store_name),
        purchase_grn(grn_number)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ returns: data || [] });
  } catch (error) {
    console.error('Error fetching purchase returns:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single purchase return with items
router.get('/:id', async (req, res) => {
  try {
    const { data: returnData, error: returnError } = await supabase
      .from('purchase_return')
      .select(`
        *,
        suppliers(name),
        stores(store_name),
        purchase_grn(grn_number)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (returnError) throw returnError;

    const { data: items, error: itemsError } = await supabase
      .from('purchase_return_items')
      .select(`
        *,
        products(name, sku)
      `)
      .eq('return_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ ...returnData, items: items || [] });
  } catch (error) {
    console.error('Error fetching purchase return:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create purchase return
router.post('/', async (req, res) => {
  try {
    const {
      supplier_id,
      grn_id,
      store_id,
      return_date,
      items,
      reason,
      notes
    } = req.body;
    const user = req.user;

    if (!supplier_id || !store_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Supplier, store, and items are required' });
    }

    // Generate return number
    const { data: lastReturn } = await supabase
      .from('purchase_return')
      .select('return_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let returnNumber = 'PR-0001';
    if (lastReturn && lastReturn.return_number) {
      const lastNumber = parseInt(lastReturn.return_number.split('-')[1]);
      returnNumber = `PR-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    // Calculate total
    const total = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);

    // Create purchase return
    const { data: purchaseReturn, error: returnError } = await supabase
      .from('purchase_return')
      .insert([{
        return_number: returnNumber,
        supplier_id,
        grn_id,
        store_id,
        return_date: return_date || new Date().toISOString().split('T')[0],
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
      return_id: purchaseReturn.id,
      product_id: item.product_id,
      quantity: parseFloat(item.quantity),
      rate: parseFloat(item.rate)
    }));

    const { error: itemsError } = await supabase
      .from('purchase_return_items')
      .insert(returnItems);

    if (itemsError) throw itemsError;

    // Update item_stock - reduce quantity
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
            quantity: existingStock.quantity - parseFloat(item.quantity),
            last_updated: new Date().toISOString()
          })
          .eq('product_id', item.product_id)
          .eq('store_id', store_id);

        // Create stock movement record
        await supabase
          .from('stock_movements')
          .insert([{
            product_id: item.product_id,
            movement_type: 'purchase_return',
            quantity: -parseFloat(item.quantity),
            reference_type: 'purchase_return',
            reference_id: purchaseReturn.id,
            notes: `Purchase Return - ${returnNumber}`,
            created_at: new Date().toISOString()
          }]);
      }
    }

    res.status(201).json({ 
      message: 'Purchase return created successfully',
      return: purchaseReturn,
      return_number: returnNumber
    });

  } catch (error) {
    console.error('Error creating purchase return:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE purchase return
router.delete('/:id', async (req, res) => {
  try {
    await supabase
      .from('purchase_return_items')
      .delete()
      .eq('return_id', req.params.id);

    const { error } = await supabase
      .from('purchase_return')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Purchase return deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
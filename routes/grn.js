const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all GRNs
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purchase_grn')
      .select(`
        *,
        suppliers(name),
        stores(store_name),
        purchase_orders(order_number)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ grns: data || [] });
  } catch (error) {
    console.error('Error fetching GRNs:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single GRN with items
router.get('/:id', async (req, res) => {
  try {
    const { data: grn, error: grnError } = await supabase
      .from('purchase_grn')
      .select(`
        *,
        suppliers(name),
        stores(store_name)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (grnError) throw grnError;

    const { data: items, error: itemsError } = await supabase
      .from('purchase_grn_items')
      .select(`
        *,
        products(name, sku)
      `)
      .eq('grn_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ ...grn, items: items || [] });
  } catch (error) {
    console.error('Error fetching GRN:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create GRN
router.post('/', async (req, res) => {
  try {
    const {
      supplier_id,
      purchase_order_id,
      store_id,
      grn_date,
      items,
      notes
    } = req.body;
    const user = req.user;

    if (!supplier_id || !store_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Supplier, store, and items are required' });
    }

    // Generate GRN number
    const { data: lastGRN } = await supabase
      .from('purchase_grn')
      .select('grn_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let grnNumber = 'GRN-0001';
    if (lastGRN && lastGRN.grn_number) {
      const lastNumber = parseInt(lastGRN.grn_number.split('-')[1]);
      grnNumber = `GRN-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    // Calculate total
    const total = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);

    // Create GRN
    const { data: grn, error: grnError } = await supabase
      .from('purchase_grn')
      .insert([{
        grn_number: grnNumber,
        supplier_id,
        purchase_order_id,
        store_id,
        grn_date: grn_date || new Date().toISOString().split('T')[0],
        total_amount: total,
        notes,
        status: 'received',
        created_by: user?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (grnError) throw grnError;

    // Create GRN items
    const grnItems = items.map(item => ({
      grn_id: grn.id,
      product_id: item.product_id,
      quantity: parseFloat(item.quantity),
      rate: parseFloat(item.rate),
      created_at: new Date().toISOString()
    }));

    const { error: itemsError } = await supabase
      .from('purchase_grn_items')
      .insert(grnItems);

    if (itemsError) throw itemsError;

    // Update item_stock for each product
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

      // Create stock movement record
      await supabase
        .from('stock_movements')
        .insert([{
          product_id: item.product_id,
          movement_type: 'purchase',
          quantity: parseFloat(item.quantity),
          reference_type: 'grn',
          reference_id: grn.id,
          notes: `GRN - ${grnNumber}`,
          created_at: new Date().toISOString()
        }]);
    }

    res.status(201).json({ 
      message: 'GRN created successfully',
      grn,
      grn_number: grnNumber
    });

  } catch (error) {
    console.error('Error creating GRN:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update GRN status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const { data, error } = await supabase
      .from('purchase_grn')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE GRN
router.delete('/:id', async (req, res) => {
  try {
    // Delete items first
    await supabase
      .from('purchase_grn_items')
      .delete()
      .eq('grn_id', req.params.id);

    // Delete GRN
    const { error } = await supabase
      .from('purchase_grn')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'GRN deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
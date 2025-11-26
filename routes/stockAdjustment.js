const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all stock adjustments
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock_adjustment')
      .select(`
        *,
        stores(store_name)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ adjustments: data || [] });
  } catch (error) {
    console.error('Error fetching stock adjustments:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single adjustment with items
router.get('/:id', async (req, res) => {
  try {
    const { data: adjustment, error: adjError } = await supabase
      .from('stock_adjustment')
      .select(`
        *,
        stores(store_name)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (adjError) throw adjError;

    const { data: items, error: itemsError } = await supabase
      .from('stock_adjustment_items')
      .select(`
        *,
        products(name, sku)
      `)
      .eq('adjustment_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ ...adjustment, items: items || [] });
  } catch (error) {
    console.error('Error fetching adjustment:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create stock adjustment
router.post('/', async (req, res) => {
  try {
    const {
      store_id,
      adjustment_date,
      adjustment_type,
      items,
      reason,
      notes
    } = req.body;
    const user = req.user;

    if (!store_id || !adjustment_type || !items || items.length === 0) {
      return res.status(400).json({ error: 'Store, adjustment type, and items are required' });
    }

    // Generate adjustment number
    const { data: lastAdjustment } = await supabase
      .from('stock_adjustment')
      .select('adjustment_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let adjustmentNumber = 'SA-0001';
    if (lastAdjustment && lastAdjustment.adjustment_number) {
      const lastNumber = parseInt(lastAdjustment.adjustment_number.split('-')[1]);
      adjustmentNumber = `SA-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    // Create adjustment
    const { data: adjustment, error: adjError } = await supabase
      .from('stock_adjustment')
      .insert([{
        adjustment_number: adjustmentNumber,
        store_id,
        adjustment_date: adjustment_date || new Date().toISOString().split('T')[0],
        adjustment_type, // increase/decrease/damage/loss/found
        reason,
        notes,
        created_by: user?.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (adjError) throw adjError;

    // Create adjustment items
    const adjustmentItems = items.map(item => ({
      adjustment_id: adjustment.id,
      product_id: item.product_id,
      quantity: parseFloat(item.quantity),
      notes: item.notes,
      created_at: new Date().toISOString()
    }));

    const { error: itemsError } = await supabase
      .from('stock_adjustment_items')
      .insert(adjustmentItems);

    if (itemsError) throw itemsError;

    // Update stock based on adjustment type
    for (const item of items) {
      const { data: existingStock } = await supabase
        .from('item_stock')
        .select('*')
        .eq('product_id', item.product_id)
        .eq('store_id', store_id)
        .single();

      if (existingStock) {
        let newQuantity = existingStock.quantity;
        
        // Determine if we're adding or subtracting
        if (['increase', 'found'].includes(adjustment_type)) {
          newQuantity += parseFloat(item.quantity);
        } else if (['decrease', 'damage', 'loss'].includes(adjustment_type)) {
          newQuantity -= parseFloat(item.quantity);
        }

        await supabase
          .from('item_stock')
          .update({
            quantity: newQuantity,
            last_updated: new Date().toISOString()
          })
          .eq('product_id', item.product_id)
          .eq('store_id', store_id);

        // Create stock movement
        const movementQuantity = ['increase', 'found'].includes(adjustment_type) 
          ? parseFloat(item.quantity) 
          : -parseFloat(item.quantity);

        await supabase
          .from('stock_movements')
          .insert([{
            product_id: item.product_id,
            movement_type: 'adjustment',
            quantity: movementQuantity,
            reference_type: 'stock_adjustment',
            reference_id: adjustment.id,
            notes: `Adjustment (${adjustment_type}) - ${adjustmentNumber}`,
            created_at: new Date().toISOString()
          }]);
      }
    }

    res.status(201).json({
      message: 'Stock adjustment created successfully',
      adjustment,
      adjustment_number: adjustmentNumber
    });

  } catch (error) {
    console.error('Error creating stock adjustment:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE stock adjustment
router.delete('/:id', async (req, res) => {
  try {
    await supabase
      .from('stock_adjustment_items')
      .delete()
      .eq('adjustment_id', req.params.id);

    const { error } = await supabase
      .from('stock_adjustment')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Stock adjustment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
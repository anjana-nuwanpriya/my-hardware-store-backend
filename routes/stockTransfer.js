const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all stock transfers
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock_transfer')
      .select(`
        *,
        from_store:stores!stock_transfer_from_store_id_fkey(store_name),
        to_store:stores!stock_transfer_to_store_id_fkey(store_name)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ transfers: data || [] });
  } catch (error) {
    console.error('Error fetching stock transfers:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single transfer with items
router.get('/:id', async (req, res) => {
  try {
    const { data: transfer, error: transferError } = await supabase
      .from('stock_transfer')
      .select(`
        *,
        from_store:stores!stock_transfer_from_store_id_fkey(store_name),
        to_store:stores!stock_transfer_to_store_id_fkey(store_name)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (transferError) throw transferError;

    const { data: items, error: itemsError } = await supabase
      .from('stock_transfer_items')
      .select(`
        *,
        products(name, sku)
      `)
      .eq('transfer_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ ...transfer, items: items || [] });
  } catch (error) {
    console.error('Error fetching transfer:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create stock transfer
router.post('/', async (req, res) => {
  try {
    const {
      from_store_id,
      to_store_id,
      transfer_date,
      items,
      reference_no,
      notes
    } = req.body;
    const user = req.user;

    if (!from_store_id || !to_store_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'From store, to store, and items are required' });
    }

    if (from_store_id === to_store_id) {
      return res.status(400).json({ error: 'Source and destination stores must be different' });
    }

    // Generate transfer number
    const { data: lastTransfer } = await supabase
      .from('stock_transfer')
      .select('transfer_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let transferNumber = 'ST-0001';
    if (lastTransfer && lastTransfer.transfer_number) {
      const lastNumber = parseInt(lastTransfer.transfer_number.split('-')[1]);
      transferNumber = `ST-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    // Create transfer
    const { data: transfer, error: transferError } = await supabase
      .from('stock_transfer')
      .insert([{
        transfer_number: transferNumber,
        from_store_id,
        to_store_id,
        transfer_date: transfer_date || new Date().toISOString().split('T')[0],
        status: 'completed',
        reference_no,
        notes,
        created_by: user?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (transferError) throw transferError;

    // Create transfer items
    const transferItems = items.map(item => ({
      transfer_id: transfer.id,
      product_id: item.product_id,
      quantity: parseFloat(item.quantity),
      created_at: new Date().toISOString()
    }));

    const { error: itemsError } = await supabase
      .from('stock_transfer_items')
      .insert(transferItems);

    if (itemsError) throw itemsError;

    // Update stock - decrease from source, increase in destination
    for (const item of items) {
      // Decrease from source store
      const { data: fromStock } = await supabase
        .from('item_stock')
        .select('*')
        .eq('product_id', item.product_id)
        .eq('store_id', from_store_id)
        .single();

      if (fromStock) {
        await supabase
          .from('item_stock')
          .update({
            quantity: fromStock.quantity - parseFloat(item.quantity),
            last_updated: new Date().toISOString()
          })
          .eq('product_id', item.product_id)
          .eq('store_id', from_store_id);
      }

      // Increase in destination store
      const { data: toStock } = await supabase
        .from('item_stock')
        .select('*')
        .eq('product_id', item.product_id)
        .eq('store_id', to_store_id)
        .single();

      if (toStock) {
        await supabase
          .from('item_stock')
          .update({
            quantity: toStock.quantity + parseFloat(item.quantity),
            last_updated: new Date().toISOString()
          })
          .eq('product_id', item.product_id)
          .eq('store_id', to_store_id);
      } else {
        await supabase
          .from('item_stock')
          .insert([{
            product_id: item.product_id,
            store_id: to_store_id,
            quantity: parseFloat(item.quantity),
            reserved_quantity: 0,
            last_updated: new Date().toISOString()
          }]);
      }

      // Create stock movement records
      await supabase
        .from('stock_movements')
        .insert([
          {
            product_id: item.product_id,
            movement_type: 'transfer_out',
            quantity: -parseFloat(item.quantity),
            reference_type: 'stock_transfer',
            reference_id: transfer.id,
            notes: `Transfer Out - ${transferNumber}`,
            created_at: new Date().toISOString()
          },
          {
            product_id: item.product_id,
            movement_type: 'transfer_in',
            quantity: parseFloat(item.quantity),
            reference_type: 'stock_transfer',
            reference_id: transfer.id,
            notes: `Transfer In - ${transferNumber}`,
            created_at: new Date().toISOString()
          }
        ]);
    }

    res.status(201).json({
      message: 'Stock transfer created successfully',
      transfer,
      transfer_number: transferNumber
    });

  } catch (error) {
    console.error('Error creating stock transfer:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE stock transfer
router.delete('/:id', async (req, res) => {
  try {
    await supabase
      .from('stock_transfer_items')
      .delete()
      .eq('transfer_id', req.params.id);

    const { error } = await supabase
      .from('stock_transfer')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Stock transfer deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
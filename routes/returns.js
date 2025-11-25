const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all returns
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('returns')
      .select(`
        *,
        customers(first_name, last_name),
        staff(first_name, last_name),
        orders(order_number)
      `)
      .order('return_date', { ascending: false });
    
    if (error) throw error;
    res.json({ returns: data || [] });
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single return with items
router.get('/:id', async (req, res) => {
  try {
    const { data: returnData, error: returnError } = await supabase
      .from('returns')
      .select(`
        *,
        customers(first_name, last_name, email, phone),
        staff(first_name, last_name),
        orders(order_number, order_date)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (returnError) throw returnError;

    const { data: items, error: itemsError } = await supabase
      .from('return_items')
      .select(`
        *,
        products(name, sku)
      `)
      .eq('return_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ ...returnData, items: items || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create return
router.post('/', async (req, res) => {
  try {
    const { 
      original_order_id, 
      customer_id, 
      staff_id, 
      reason, 
      condition, 
      items, 
      notes 
    } = req.body;

    if (!original_order_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Order and items are required' });
    }

    // Generate return number
    const { data: lastReturn } = await supabase
      .from('returns')
      .select('return_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let returnNumber = 'RET-0001';
    if (lastReturn && lastReturn.return_number) {
      const lastNumber = parseInt(lastReturn.return_number.split('-')[1]);
      returnNumber = `RET-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    // Calculate refund amount
    let refundAmount = 0;
    items.forEach(item => {
      refundAmount += parseFloat(item.unit_price) * parseInt(item.quantity);
    });

    // Create return
    const { data: returnData, error: returnError } = await supabase
      .from('returns')
      .insert([{
        return_number: returnNumber,
        original_order_id,
        customer_id,
        staff_id,
        return_date: new Date().toISOString(),
        reason,
        condition,
        refund_amount: refundAmount,
        status: 'pending',
        notes,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (returnError) throw returnError;

    // Create return items
    const returnItems = items.map(item => ({
      return_id: returnData.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      condition: condition,
      created_at: new Date().toISOString()
    }));

    const { error: itemsError } = await supabase
      .from('return_items')
      .insert(returnItems);

    if (itemsError) throw itemsError;

    // Update inventory (add back to stock if condition is good)
    if (condition === 'good' || condition === 'new') {
      for (const item of items) {
        const { data: currentInventory } = await supabase
          .from('inventory')
          .select('*')
          .eq('product_id', item.product_id)
          .single();

        if (currentInventory) {
          const newQuantity = (currentInventory.quantity_on_hand || 0) + parseInt(item.quantity);
          
          await supabase
            .from('inventory')
            .update({
              quantity_on_hand: newQuantity,
              updated_at: new Date().toISOString()
            })
            .eq('product_id', item.product_id);

          // Create stock movement
          await supabase
            .from('stock_movements')
            .insert([{
              product_id: item.product_id,
              movement_type: 'return_in',
              quantity: item.quantity,
              reference_type: 'return',
              reference_id: returnData.id,
              notes: `Returned: ${reason}`,
              created_at: new Date().toISOString()
            }]);
        }
      }
    }

    res.status(201).json(returnData);
  } catch (error) {
    console.error('Error creating return:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update return status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const { data, error } = await supabase
      .from('returns')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE return
router.delete('/:id', async (req, res) => {
  try {
    // Delete items first
    await supabase
      .from('return_items')
      .delete()
      .eq('return_id', req.params.id);

    // Delete return
    const { error } = await supabase
      .from('returns')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Return deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
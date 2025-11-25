const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all purchase orders
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers(name, contact_person),
        staff(first_name, last_name)
      `)
      .order('order_date', { ascending: false });
    
    if (error) throw error;
    res.json({ purchaseOrders: data || [] });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single purchase order with items
router.get('/:id', async (req, res) => {
  try {
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers(name, contact_person, email, phone),
        staff(first_name, last_name)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (poError) throw poError;

    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select(`
        *,
        products(name, sku, unit)
      `)
      .eq('purchase_order_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ ...po, items: items || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create purchase order
router.post('/', async (req, res) => {
  try {
    const { supplier_id, staff_id, expected_date, items, notes } = req.body;

    if (!supplier_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Supplier and items are required' });
    }

    // Generate PO number
    const { data: lastPO } = await supabase
      .from('purchase_orders')
      .select('po_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let poNumber = 'PO-0001';
    if (lastPO && lastPO.po_number) {
      const lastNumber = parseInt(lastPO.po_number.split('-')[1]);
      poNumber = `PO-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    // Calculate totals
    let subtotal = 0;
    items.forEach(item => {
      subtotal += parseFloat(item.unit_cost) * parseInt(item.quantity_ordered);
    });

    const taxAmount = subtotal * 0; // Add tax logic if needed
    const shippingCost = 0; // Add shipping if needed
    const totalAmount = subtotal + taxAmount + shippingCost;

    // Create purchase order
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .insert([{
        po_number: poNumber,
        supplier_id,
        staff_id,
        status: 'pending',
        order_date: new Date().toISOString(),
        expected_date,
        subtotal,
        tax_amount: taxAmount,
        shipping_cost: shippingCost,
        total_amount: totalAmount,
        notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (poError) throw poError;

    // Create purchase order items
    const poItems = items.map(item => ({
      purchase_order_id: po.id,
      product_id: item.product_id,
      quantity_ordered: item.quantity_ordered,
      quantity_received: 0,
      unit_cost: item.unit_cost,
      line_total: parseFloat(item.unit_cost) * parseInt(item.quantity_ordered),
      created_at: new Date().toISOString()
    }));

    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(poItems);

    if (itemsError) throw itemsError;

    res.status(201).json(po);
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT receive purchase order
router.put('/:id/receive', async (req, res) => {
  try {
    const { items } = req.body;

    // Update PO items with received quantities
    for (const item of items) {
      const { error: itemError } = await supabase
        .from('purchase_order_items')
        .update({ quantity_received: item.quantity_received })
        .eq('id', item.id);

      if (itemError) throw itemError;

      // Update inventory
      const { data: currentInventory } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_id', item.product_id)
        .single();

      if (currentInventory) {
        const newQuantity = (currentInventory.quantity_on_hand || 0) + parseInt(item.quantity_received);
        
        await supabase
          .from('inventory')
          .update({
            quantity_on_hand: newQuantity,
            last_received_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('product_id', item.product_id);
      }

      // Create stock movement
      await supabase
        .from('stock_movements')
        .insert([{
          product_id: item.product_id,
          movement_type: 'purchase_in',
          quantity: item.quantity_received,
          reference_type: 'purchase_order',
          reference_id: req.params.id,
          cost_per_unit: item.unit_cost,
          notes: 'Received from purchase order',
          created_at: new Date().toISOString()
        }]);
    }

    // Update PO status
    const { data, error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'received',
        received_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error receiving purchase order:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE purchase order
router.delete('/:id', async (req, res) => {
  try {
    // Delete items first
    await supabase
      .from('purchase_order_items')
      .delete()
      .eq('purchase_order_id', req.params.id);

    // Delete purchase order
    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Purchase order deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
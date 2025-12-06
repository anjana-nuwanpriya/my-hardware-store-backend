const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Protect all routes
router.use(authMiddleware);

/* ---------------------------------------------------------
   UTILITY — Generate Next PO Number
--------------------------------------------------------- */
async function generatePONumber() {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('po_number')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) return 'PO-0001';

  const last = data[0].po_number;
  const number = parseInt(last.split('-')[1]) + 1;

  return `PO-${String(number).padStart(4, '0')}`;
}

/* ---------------------------------------------------------
   GET Next PO Number
--------------------------------------------------------- */
router.get('/next/po-number', async (req, res) => {
  try {
    const poNumber = await generatePONumber();
    res.json({ poNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ---------------------------------------------------------
   GET All Purchase Orders
--------------------------------------------------------- */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers(name),
        stores(name),
        employees(name)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ orders: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ---------------------------------------------------------
   GET Single Purchase Order + Items
--------------------------------------------------------- */
router.get('/:id', async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers(name),
        stores(name),
        employees(name)
      `)
      .eq('id', req.params.id)
      .single();

    if (orderError) throw orderError;

    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select(`
        *,
        items(code, name)
      `)
      .eq('purchase_order_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ order, items: items || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ---------------------------------------------------------
   CREATE Purchase Order
--------------------------------------------------------- */
router.post('/', async (req, res) => {
  try {
    const {
      order_date,
      supplier_id,
      store_id,
      employee_id,
      description,
      items,
      payment_status
    } = req.body;

    // Helper to avoid "" UUID errors
    const normalizeUUID = (value) =>
      value && value.trim() !== "" ? value : null;

    const supplier_uuid = normalizeUUID(supplier_id);
    const store_uuid = normalizeUUID(store_id);
    const employee_uuid = normalizeUUID(employee_id);
    const created_by_uuid = normalizeUUID(req.user.id);

    if (!supplier_uuid) {
      return res.status(400).json({ error: "Supplier is required" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    const po_number = await generatePONumber();

    // Calculate totals
    const subtotal = items.reduce((sum, i) => {
      const qty = Number(i.quantity || 0);
      const price = Number(i.unit_cost || 0);
      return sum + (qty * price);
    }, 0);

    const total_discount = items.reduce((sum, i) => 
      sum + Number(i.discount_value || 0), 0
    );

    const total_amount = subtotal - total_discount;

    // ==========================================
    // 🔥 FIX: Use 'pending' instead of 'completed'
    // Valid status values: 'pending', 'approved', 'received', 'cancelled'
    // ==========================================
    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .insert({
        po_number,
        order_date,
        supplier_id: supplier_uuid,
        store_id: store_uuid,
        employee_id: employee_uuid,
        description,
        subtotal: subtotal,
        discount: total_discount,
        total: total_amount,
        total_amount: total_amount,
        payment_status: payment_status || 'unpaid',
        status: 'pending',  // ✅ Use 'pending' as default status
        created_by: created_by_uuid,
        is_active: true
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      throw orderError;
    }

    // Insert items
    const formattedItems = items.map(i => ({
      purchase_order_id: order.id,
      item_id: normalizeUUID(i.item_id),
      batch_no: i.batch_no || null,
      quantity: Number(i.quantity),
      unit_cost: Number(i.unit_cost),
      discount_percent: Number(i.discount_percent || 0),
      discount_value: Number(i.discount_value || 0),
      net_value: Number(i.net_value),
      total: Number(i.net_value)
    }));

    const { error: itemError } = await supabase
      .from('purchase_order_items')
      .insert(formattedItems);

    if (itemError) {
      console.error('Items insert error:', itemError);
      throw itemError;
    }

    // Update stock quantities
    for (const item of items) {
      if (!item.item_id) continue;

      const { data: currentItem } = await supabase
        .from('items')
        .select('stock_quantity')
        .eq('id', item.item_id)
        .single();

      if (currentItem) {
        const newStock = Number(currentItem.stock_quantity || 0) + Number(item.quantity);
        
        await supabase
          .from('items')
          .update({ stock_quantity: newStock })
          .eq('id', item.item_id);
      }
    }

    // Update supplier balance (if credit/unpaid)
    if (payment_status === 'credit' || payment_status === 'unpaid') {
      const { data: currentSupplier } = await supabase
        .from('suppliers')
        .select('op_balance')
        .eq('id', supplier_uuid)
        .single();

      if (currentSupplier) {
        const newBalance = Number(currentSupplier.op_balance || 0) + total_amount;
        
        await supabase
          .from('suppliers')
          .update({ op_balance: newBalance })
          .eq('id', supplier_uuid);
      }
    }

    res.json({
      message: 'Purchase order created successfully',
      order
    });

  } catch (error) {
    console.error('Error in POST /:', error);
    res.status(500).json({ error: error.message });
  }
});

/* ---------------------------------------------------------
   SOFT DELETE Purchase Order
--------------------------------------------------------- */
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ is_active: false })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Purchase order deleted successfully' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
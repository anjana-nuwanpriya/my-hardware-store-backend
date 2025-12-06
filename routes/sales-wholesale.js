const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Generate next invoice number
async function generateInvoiceNumber() {
  const { data, error } = await supabase
    .from('sales_wholesale')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0) {
    return 'SW-0001';
  }

  const lastInv = data[0].invoice_number;
  const lastNum = parseInt(lastInv.split('-')[1]);
  const nextNum = lastNum + 1;
  return `SW-${String(nextNum).padStart(4, '0')}`;
}

// GET all sales
router.get('/', async (req, res) => {
  try {
    const { data: sales, error } = await supabase
      .from('sales_wholesale')
      .select(`
        *,
        customers(name),
        stores(name),
        employees(name)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ sales: sales || [] });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single sale with items
router.get('/:id', async (req, res) => {
  try {
    const { data: sale, error: saleError } = await supabase
      .from('sales_wholesale')
      .select(`
        *,
        customers(name),
        stores(name),
        employees(name)
      `)
      .eq('id', req.params.id)
      .single();

    if (saleError) throw saleError;

    const { data: items, error: itemsError } = await supabase
      .from('sales_wholesale_items')
      .select(`
        *,
        items(code, name)
      `)
      .eq('sales_wholesale_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ sale, items: items || [] });
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET next invoice number
router.get('/next/invoice-number', async (req, res) => {
  try {
    const invoiceNumber = await generateInvoiceNumber();
    res.json({ invoiceNumber });
  } catch (error) {
    console.error('Error generating invoice number:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create new sale
router.post('/', async (req, res) => {
  try {
    const { 
      sale_date, customer_id, store_id, employee_id, 
      description, items, payment_method, payment_status 
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // Validate stock availability
    for (const item of items) {
      const { data: stockItem } = await supabase
        .from('items')
        .select('stock_quantity, name')
        .eq('id', item.item_id)
        .single();

      if (!stockItem) {
        return res.status(400).json({ error: `Item not found` });
      }

      if (parseFloat(stockItem.stock_quantity) < parseFloat(item.quantity)) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${stockItem.name}. Available: ${stockItem.stock_quantity}` 
        });
      }
    }

    // Generate invoice number
    const invoice_number = await generateInvoiceNumber();

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.net_value || 0), 0);
    const discount = items.reduce((sum, item) => sum + parseFloat(item.discount_value || 0), 0);
    const total_amount = subtotal;

    // Create sale
    const { data: sale, error: saleError } = await supabase
      .from('sales_wholesale')
      .insert({
        invoice_number,
        sale_date,
        customer_id: customer_id || null,
        store_id,
        employee_id,
        description,
        subtotal,
        discount,
        total_amount,
        payment_method: payment_method || 'cash',
        payment_status: payment_status || 'paid',
        created_by: req.user.id
      })
      .select()
      .single();

    if (saleError) throw saleError;

    // Create items
    const itemsToInsert = items.map(item => ({
      sales_wholesale_id: sale.id,
      item_id: item.item_id,
      batch_no: item.batch_no,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent || 0,
      discount_value: item.discount_value || 0,
      net_value: item.net_value
    }));

    const { error: itemsError } = await supabase
      .from('sales_wholesale_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    // Update stock quantities (reduce)
    for (const item of items) {
      const { data: currentItem } = await supabase
        .from('items')
        .select('stock_quantity')
        .eq('id', item.item_id)
        .single();

      await supabase
        .from('items')
        .update({ 
          stock_quantity: parseFloat(currentItem.stock_quantity || 0) - parseFloat(item.quantity)
        })
        .eq('id', item.item_id);
    }

    // Update customer balance if credit/unpaid and customer selected
    if (customer_id && (payment_status === 'unpaid' || payment_status === 'credit')) {
      const { data: customer } = await supabase
        .from('customers')
        .select('op_balance')
        .eq('id', customer_id)
        .single();

      await supabase
        .from('customers')
        .update({ 
          op_balance: parseFloat(customer.op_balance || 0) + parseFloat(total_amount)
        })
        .eq('id', customer_id);
    }

    res.json({ sale, message: 'Wholesale sale created successfully' });
  } catch (error) {
    console.error('Error creating sale:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('sales_wholesale')
      .update({ is_active: false })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting sale:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
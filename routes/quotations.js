const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all quotations
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('quotations')
      .select(`
        *,
        customers(first_name, last_name, customer_number)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ quotations: data || [] });
  } catch (error) {
    console.error('Error fetching quotations:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single quotation with items
router.get('/:id', async (req, res) => {
  try {
    const { data: quotation, error: quotError } = await supabase
      .from('quotations')
      .select(`
        *,
        customers(first_name, last_name, customer_number, phone, email)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (quotError) throw quotError;

    const { data: items, error: itemsError } = await supabase
      .from('quotation_items')
      .select(`
        *,
        products(name, sku)
      `)
      .eq('quotation_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ ...quotation, items: items || [] });
  } catch (error) {
    console.error('Error fetching quotation:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create quotation
router.post('/', async (req, res) => {
  try {
    const {
      customer_id,
      quotation_date,
      valid_until,
      items,
      notes,
      terms
    } = req.body;
    const user = req.user;

    if (!customer_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer and items are required' });
    }

    // Generate quotation number
    const { data: lastQuotation } = await supabase
      .from('quotations')
      .select('quotation_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let quotationNumber = 'QT-0001';
    if (lastQuotation && lastQuotation.quotation_number) {
      const lastNumber = parseInt(lastQuotation.quotation_number.split('-')[1]);
      quotationNumber = `QT-${String(lastNumber + 1).padStart(4, '0')}`;
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const taxAmount = 0; // Can be calculated based on tax rates
    const discountAmount = 0; // Can be added if needed
    const totalAmount = subtotal + taxAmount - discountAmount;

    // Create quotation
    const { data: quotation, error: quotError } = await supabase
      .from('quotations')
      .insert([{
        quotation_number: quotationNumber,
        customer_id,
        quotation_date: quotation_date || new Date().toISOString().split('T')[0],
        valid_until: valid_until || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0], // 30 days
        subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        status: 'pending',
        notes,
        terms,
        created_by: user?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (quotError) throw quotError;

    // Create quotation items
    const quotationItems = items.map(item => ({
      quotation_id: quotation.id,
      product_id: item.product_id,
      quantity: parseFloat(item.quantity),
      unit_price: parseFloat(item.unit_price),
      created_at: new Date().toISOString()
    }));

    const { error: itemsError } = await supabase
      .from('quotation_items')
      .insert(quotationItems);

    if (itemsError) throw itemsError;

    res.status(201).json({
      message: 'Quotation created successfully',
      quotation,
      quotation_number: quotationNumber
    });

  } catch (error) {
    console.error('Error creating quotation:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update quotation status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const { data, error } = await supabase
      .from('quotations')
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

// DELETE quotation
router.delete('/:id', async (req, res) => {
  try {
    await supabase
      .from('quotation_items')
      .delete()
      .eq('quotation_id', req.params.id);

    const { error } = await supabase
      .from('quotations')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
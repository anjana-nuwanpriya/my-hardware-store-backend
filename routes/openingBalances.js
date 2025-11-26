const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// ==================== SUPPLIER OPENING BALANCE ====================

// GET all supplier opening balances
router.get('/supplier', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('supplier_opening_balance')
      .select(`
        *,
        suppliers(name)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ balances: data || [] });
  } catch (error) {
    console.error('Error fetching supplier balances:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create supplier opening balance
router.post('/supplier', async (req, res) => {
  try {
    const { supplier_id, amount, balance_date, note } = req.body;
    const user = req.user; // From auth middleware

    if (!supplier_id || amount === undefined) {
      return res.status(400).json({ error: 'Supplier ID and amount are required' });
    }

    const { data, error } = await supabase
      .from('supplier_opening_balance')
      .insert([{
        supplier_id,
        amount: parseFloat(amount),
        balance_date: balance_date || new Date().toISOString().split('T')[0],
        note,
        created_by: user?.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating supplier balance:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CUSTOMER OPENING BALANCE ====================

// GET all customer opening balances
router.get('/customer', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customer_opening_balance')
      .select(`
        *,
        customers(first_name, last_name, customer_number)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ balances: data || [] });
  } catch (error) {
    console.error('Error fetching customer balances:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create customer opening balance
router.post('/customer', async (req, res) => {
  try {
    const { customer_id, amount, balance_date, note } = req.body;
    const user = req.user;

    if (!customer_id || amount === undefined) {
      return res.status(400).json({ error: 'Customer ID and amount are required' });
    }

    const { data, error } = await supabase
      .from('customer_opening_balance')
      .insert([{
        customer_id,
        amount: parseFloat(amount),
        balance_date: balance_date || new Date().toISOString().split('T')[0],
        note,
        created_by: user?.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating customer balance:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== OPENING STOCK ENTRY ====================

// GET all opening stock entries
router.get('/stock', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('opening_stock_entry')
      .select(`
        *,
        products(name, sku),
        stores(store_name)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (error) {
    console.error('Error fetching opening stock:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create opening stock entry
router.post('/stock', async (req, res) => {
  try {
    const { product_id, store_id, quantity, rate, entry_date } = req.body;
    const user = req.user;

    if (!product_id || !store_id || !quantity) {
      return res.status(400).json({ error: 'Product, store, and quantity are required' });
    }

    // Insert opening stock
    const { data, error } = await supabase
      .from('opening_stock_entry')
      .insert([{
        product_id,
        store_id,
        quantity: parseFloat(quantity),
        rate: parseFloat(rate) || 0,
        entry_date: entry_date || new Date().toISOString().split('T')[0],
        created_by: user?.id,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Update item_stock table
    const { data: existingStock } = await supabase
      .from('item_stock')
      .select('*')
      .eq('product_id', product_id)
      .eq('store_id', store_id)
      .single();

    if (existingStock) {
      // Update existing stock
      await supabase
        .from('item_stock')
        .update({
          quantity: existingStock.quantity + parseFloat(quantity),
          last_updated: new Date().toISOString()
        })
        .eq('product_id', product_id)
        .eq('store_id', store_id);
    } else {
      // Create new stock record
      await supabase
        .from('item_stock')
        .insert([{
          product_id,
          store_id,
          quantity: parseFloat(quantity),
          reserved_quantity: 0,
          last_updated: new Date().toISOString()
        }]);
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating opening stock:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE opening stock entry
router.delete('/stock/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('opening_stock_entry')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Opening stock entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
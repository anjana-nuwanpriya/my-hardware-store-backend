const express = require('express');
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Get all customers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query;
    
    let query = supabase
      .from('customers')
      .select('*')
      .eq('is_active', true);
    
    if (type) {
      query = query.eq('type', type);
    }
    
    query = query.order('name', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    res.json({ customers: data || [] });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single customer
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json({ customer: data });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create customer
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address, type, op_balance } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const { data, error } = await supabase
      .from('customers')
      .insert([{
        name,
        phone,
        address,
        type: type || 'retail',
        op_balance: op_balance || 0,
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ 
      message: 'Customer created successfully', 
      customer: data 
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update customer
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address, type, op_balance } = req.body;

    const { data, error } = await supabase
      .from('customers')
      .update({ name, phone, address, type, op_balance })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ 
      message: 'Customer updated successfully', 
      customer: data 
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete customer (soft delete)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
const express = require('express');
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Get all suppliers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ suppliers: data || [] });
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single supplier
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json({ supplier: data });
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create supplier
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address, op_balance } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert([{
        name,
        phone,
        address,
        op_balance: op_balance || 0,
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ 
      message: 'Supplier created successfully', 
      supplier: data 
    });
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update supplier
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address, op_balance } = req.body;

    const { data, error } = await supabase
      .from('suppliers')
      .update({
        name,
        phone,
        address,
        op_balance
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ 
      message: 'Supplier updated successfully', 
      supplier: data 
    });
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete supplier (soft delete)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
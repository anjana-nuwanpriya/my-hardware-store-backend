const express = require('express');
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('items').select('*, categories(name)').eq('is_active', true).order('name', { ascending: true });
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { code, name, category_id, cost_price, retail_price, wholesale_price } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Code and name are required' });
    const { data, error } = await supabase.from('items').insert([{
      code, name, category_id, cost_price: cost_price || 0, retail_price: retail_price || 0, 
      wholesale_price: wholesale_price || 0, is_active: true
    }]).select().single();
    if (error) throw error;
    res.status(201).json({ message: 'Item created successfully', item: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { code, name, category_id, cost_price, retail_price, wholesale_price } = req.body;
    const { data, error } = await supabase.from('items').update({
      code, name, category_id, cost_price, retail_price, wholesale_price
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ message: 'Item updated successfully', item: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('items').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
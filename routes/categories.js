const express = require('express');
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('*').eq('is_active', true).order('name', { ascending: true });
    if (error) throw error;
    res.json({ categories: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { data, error } = await supabase.from('categories').insert([{ name, is_active: true }]).select().single();
    if (error) throw error;
    res.status(201).json({ message: 'Category created successfully', category: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const { data, error} = await supabase.from('categories').update({ name }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ message: 'Category updated successfully', category: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
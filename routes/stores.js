const express = require('express');
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    res.json({ stores: data || [] });
  } catch (error) {
    console.error('Get stores error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json({ store: data });
  } catch (error) {
    console.error('Get store error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { code, name } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }
    const { data, error } = await supabase
      .from('stores')
      .insert([{ code, name, is_active: true }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ message: 'Store created successfully', store: data });
  } catch (error) {
    console.error('Create store error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { code, name } = req.body;
    const { data, error } = await supabase
      .from('stores')
      .update({ code, name })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ message: 'Store updated successfully', store: data });
  } catch (error) {
    console.error('Update store error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stores')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ message: 'Store deleted successfully' });
  } catch (error) {
    console.error('Delete store error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
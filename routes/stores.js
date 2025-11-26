const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all stores
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('store_name');
    
    if (error) throw error;
    res.json({ stores: data || [] });
  } catch (error) {
    console.error('Error fetching stores:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single store
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create store
router.post('/', async (req, res) => {
  try {
    const { 
      store_code, store_name, location, address, 
      city, state, zip_code, phone, email, is_active 
    } = req.body;

    if (!store_code || !store_name) {
      return res.status(400).json({ error: 'Store code and name are required' });
    }

    const { data, error } = await supabase
      .from('stores')
      .insert([{
        store_code,
        store_name,
        location,
        address,
        city,
        state,
        zip_code,
        phone,
        email,
        is_active: is_active !== undefined ? is_active : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating store:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update store
router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from('stores')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE store
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('stores')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Store deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
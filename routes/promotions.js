const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all promotions
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('start_date', { ascending: false });
    
    if (error) throw error;
    res.json({ promotions: data || [] });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET active promotions
router.get('/active', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('is_active', true)
      .lte('start_date', today)
      .gte('end_date', today);
    
    if (error) throw error;
    res.json({ promotions: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single promotion
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create promotion
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      discount_type,
      discount_value,
      min_purchase_amount,
      max_discount_amount,
      start_date,
      end_date,
      is_active,
      usage_limit,
      applicable_to,
      applicable_ids
    } = req.body;

    if (!name || !discount_type || !discount_value || !start_date || !end_date) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const { data, error } = await supabase
      .from('promotions')
      .insert([{
        name,
        description,
        discount_type,
        discount_value,
        min_purchase_amount,
        max_discount_amount,
        start_date,
        end_date,
        is_active: is_active !== undefined ? is_active : true,
        usage_limit,
        usage_count: 0,
        applicable_to,
        applicable_ids: applicable_ids || [],
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating promotion:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update promotion
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      description,
      discount_type,
      discount_value,
      min_purchase_amount,
      max_discount_amount,
      start_date,
      end_date,
      is_active,
      usage_limit,
      applicable_to,
      applicable_ids
    } = req.body;

    const { data, error } = await supabase
      .from('promotions')
      .update({
        name,
        description,
        discount_type,
        discount_value,
        min_purchase_amount,
        max_discount_amount,
        start_date,
        end_date,
        is_active,
        usage_limit,
        applicable_to,
        applicable_ids
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

// DELETE promotion
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('promotions')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Promotion deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
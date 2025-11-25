const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all suppliers
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');
    
    if (error) throw error;
    res.json({ suppliers: data || [] });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single supplier
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create supplier
router.post('/', async (req, res) => {
  try {
    const { 
      name, contact_person, email, phone, address, 
      city, state, zip_code, country, tax_id, 
      payment_terms, is_active 
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert([{
        name,
        contact_person,
        email,
        phone,
        address,
        city,
        state,
        zip_code,
        country,
        tax_id,
        payment_terms,
        is_active: is_active !== undefined ? is_active : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update supplier
router.put('/:id', async (req, res) => {
  try {
    const { 
      name, contact_person, email, phone, address, 
      city, state, zip_code, country, tax_id, 
      payment_terms, is_active 
    } = req.body;

    const { data, error } = await supabase
      .from('suppliers')
      .update({
        name,
        contact_person,
        email,
        phone,
        address,
        city,
        state,
        zip_code,
        country,
        tax_id,
        payment_terms,
        is_active,
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

// DELETE supplier
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
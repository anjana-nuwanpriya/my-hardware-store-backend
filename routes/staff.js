const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

// GET all staff
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('is_active', true)
      .order('first_name');
    
    if (error) throw error;
    res.json({ staff: data || [] });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single staff member
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching staff member:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create staff
router.post('/', async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      role,
      department,
      hire_date,
      salary,
      is_active
    } = req.body;

    if (!first_name || !last_name || !email) {
      return res.status(400).json({ 
        error: 'First name, last name, and email are required' 
      });
    }

    const { data, error } = await supabase
      .from('staff')
      .insert([{
        first_name,
        last_name,
        email,
        phone,
        role: role || 'staff',
        department,
        hire_date: hire_date || new Date().toISOString(),
        salary,
        is_active: is_active !== undefined ? is_active : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update staff
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from('staff')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating staff:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE staff (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('staff')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    res.json({ 
      message: 'Staff member deactivated successfully',
      staff: data
    });
  } catch (error) {
    console.error('Error deleting staff:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
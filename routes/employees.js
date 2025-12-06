const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// GET all employees
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ employees: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE employee
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    if (!name) return res.status(400).json({ error: "Name is required" });

    const { data, error } = await supabase
      .from('employees')
      .insert([{ name, phone, address, is_active: true }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: "Created", employee: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE employee
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    const { data, error } = await supabase
      .from('employees')
      .update({ name, phone, address })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Updated", employee: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SOFT DELETE employee
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase
      .from('employees')
      .update({ is_active: false })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const { supabase } = require('../config/database');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').select('*');
    if (error) throw error;
    res.json({ customers: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
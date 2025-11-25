const express = require('express');
const { supabase } = require('../config/database');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/', requireRole(['admin']), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('store_settings')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.body.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
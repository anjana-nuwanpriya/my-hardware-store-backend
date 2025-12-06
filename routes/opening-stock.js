const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Generate next reference number
async function generateRefNumber() {
  const { data, error } = await supabase
    .from('opening_stock_entries')
    .select('ref_number')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0) {
    return 'OS-0001';
  }

  const lastRef = data[0].ref_number;
  const lastNum = parseInt(lastRef.split('-')[1]);
  const nextNum = lastNum + 1;
  return `OS-${String(nextNum).padStart(4, '0')}`;
}

// GET all opening stock entries
router.get('/', async (req, res) => {
  try {
    const { data: entries, error } = await supabase
      .from('opening_stock_entries')
      .select(`
        *,
        stores(name),
        suppliers(name),
        employees(name)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ entries: entries || [] });
  } catch (error) {
    console.error('Error fetching opening stock:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single entry with items
router.get('/:id', async (req, res) => {
  try {
    const { data: entry, error: entryError } = await supabase
      .from('opening_stock_entries')
      .select(`
        *,
        stores(name),
        suppliers(name),
        employees(name)
      `)
      .eq('id', req.params.id)
      .single();

    if (entryError) throw entryError;

    const { data: items, error: itemsError } = await supabase
      .from('opening_stock_items')
      .select(`
        *,
        items(code, name)
      `)
      .eq('opening_stock_id', req.params.id);

    if (itemsError) throw itemsError;

    res.json({ entry, items: items || [] });
  } catch (error) {
    console.error('Error fetching entry:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET next reference number
router.get('/next/ref-number', async (req, res) => {
  try {
    const refNumber = await generateRefNumber();
    res.json({ refNumber });
  } catch (error) {
    console.error('Error generating ref number:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST create new opening stock entry
router.post('/', async (req, res) => {
  try {
    const { entry_date, store_id, supplier_id, description, employee_id, items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // Generate ref number
    const ref_number = await generateRefNumber();

    // Calculate total
    const total_value = items.reduce((sum, item) => sum + parseFloat(item.net_value || 0), 0);

    // Create entry
    const { data: entry, error: entryError } = await supabase
      .from('opening_stock_entries')
      .insert({
        ref_number,
        entry_date,
        store_id,
        supplier_id,
        description,
        employee_id,
        total_value,
        created_by: req.user.id
      })
      .select()
      .single();

    if (entryError) throw entryError;

    // Create items
    const itemsToInsert = items.map(item => ({
      opening_stock_id: entry.id,
      item_id: item.item_id,
      batch_no: item.batch_no,
      quantity: item.quantity,
      cost_price: item.cost_price,
      discount_percent: item.discount_percent || 0,
      discount_value: item.discount_value || 0,
      net_value: item.net_value
    }));

    const { error: itemsError } = await supabase
      .from('opening_stock_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    // Update stock quantities
    for (const item of items) {
      const { error: updateError } = await supabase.rpc('increment_stock', {
        item_id: item.item_id,
        qty: parseFloat(item.quantity)
      });

      if (updateError) {
        // Fallback to manual update
        const { data: currentItem } = await supabase
          .from('items')
          .select('stock_quantity')
          .eq('id', item.item_id)
          .single();

        await supabase
          .from('items')
          .update({ 
            stock_quantity: parseFloat(currentItem.stock_quantity || 0) + parseFloat(item.quantity)
          })
          .eq('id', item.item_id);
      }
    }

    res.json({ entry, message: 'Opening stock entry created successfully' });
  } catch (error) {
    console.error('Error creating opening stock:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('opening_stock_entries')
      .update({ is_active: false })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Opening stock entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
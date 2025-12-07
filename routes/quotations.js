const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all quotations
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        q.*, 
        c.name as customer_name,
        st.name as store_name,
        e.name as employee_name
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN stores st ON q.store_id = st.id
      LEFT JOIN employees e ON q.employee_id = e.id
      WHERE q.is_active = true
      ORDER BY q.quotation_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single quotation with items
router.get('/:id', async (req, res) => {
  try {
    const quotationResult = await pool.query(
      'SELECT * FROM quotations WHERE id = $1',
      [req.params.id]
    );
    
    const itemsResult = await pool.query(`
      SELECT 
        qi.*,
        i.code as item_code,
        i.name as item_name
      FROM quotation_items qi
      LEFT JOIN items i ON qi.item_id = i.id
      WHERE qi.quotation_id = $1
    `, [req.params.id]);

    res.json({
      quotation: quotationResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create quotation
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { quotation_number, quotation_date, customer_id, store_id, valid_until, terms_conditions, notes, employee_id, items } = req.body;

    // Insert quotation header
    const quotationResult = await client.query(`
      INSERT INTO quotations 
      (quotation_number, quotation_date, customer_id, store_id, valid_until, terms_conditions, notes, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [quotation_number, quotation_date, customer_id, store_id, valid_until, terms_conditions, notes, employee_id]);

    const quotationId = quotationResult.rows[0].id;

    // Insert items (NO STOCK IMPACT - THIS IS JUST A QUOTE)
    for (const item of items) {
      await client.query(`
        INSERT INTO quotation_items 
        (quotation_id, item_id, batch_no, quantity, unit_price, discount_percent, discount_value, net_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [quotationId, item.item_id, item.batch_no, item.quantity, item.unit_price, item.discount_percent, item.discount_value, item.net_value]);
    }

    await client.query('COMMIT');
    res.status(201).json(quotationResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT update quotation
router.put('/:id', async (req, res) => {
  const { valid_until, terms_conditions, notes } = req.body;
  try {
    const result = await pool.query(`
      UPDATE quotations
      SET valid_until = $1, terms_conditions = $2, notes = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [valid_until, terms_conditions, notes, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE quotation (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE quotations SET is_active = false WHERE id = $1',
      [req.params.id]
    );
    res.json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

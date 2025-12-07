const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all general receipts
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        gr.*, 
        e.name as employee_name
      FROM general_receipts gr
      LEFT JOIN employees e ON gr.employee_id = e.id
      ORDER BY gr.receipt_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single receipt with items
router.get('/:id', async (req, res) => {
  try {
    const receiptResult = await pool.query(
      'SELECT * FROM general_receipts WHERE id = $1',
      [req.params.id]
    );
    
    const itemsResult = await pool.query(`
      SELECT * FROM general_receipts_items
      WHERE receipt_id = $1
    `, [req.params.id]);

    res.json({
      receipt: receiptResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create general receipt
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { receipt_number, receipt_date, income_source, payment_method, reference_number, total_amount, received_by, notes, employee_id, items } = req.body;

    // Insert receipt header
    const receiptResult = await client.query(`
      INSERT INTO general_receipts 
      (receipt_number, receipt_date, income_source, payment_method, reference_number, total_amount, received_by, notes, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [receipt_number, receipt_date, income_source, payment_method, reference_number, total_amount, received_by, notes, employee_id]);

    const receiptId = receiptResult.rows[0].id;

    // Insert items
    if (items && items.length > 0) {
      for (const item of items) {
        await client.query(`
          INSERT INTO general_receipts_items 
          (receipt_id, description, amount, category, reference)
          VALUES ($1, $2, $3, $4, $5)
        `, [receiptId, item.description, item.amount, item.category, item.reference]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(receiptResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT update receipt
router.put('/:id', async (req, res) => {
  try {
    const { notes, received_by } = req.body;
    const result = await pool.query(`
      UPDATE general_receipts
      SET notes = $1, received_by = $2
      WHERE id = $3
      RETURNING *
    `, [notes, received_by, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

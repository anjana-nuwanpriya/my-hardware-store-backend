// ============================================================================
// FILE: backend/routes/sales-return.js
// ============================================================================
const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// POST create sales return
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { return_number, return_date, customer_id, store_id, sales_retail_id, return_reason, refund_method, description, employee_id, items } = req.body;

    // Insert return header
    const returnResult = await client.query(`
      INSERT INTO sales_returns 
      (return_number, return_date, customer_id, store_id, sales_retail_id, return_reason, refund_method, description, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [return_number, return_date, customer_id, store_id, sales_retail_id, return_reason, refund_method, description, employee_id]);

    const returnId = returnResult.rows[0].id;

    // Insert items and update stock
    for (const item of items) {
      await client.query(`
        INSERT INTO sales_return_items 
        (sales_return_id, item_id, batch_no, original_qty, return_qty, unit_price, discount_percent, discount_value, refund_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [returnId, item.item_id, item.batch_no, item.original_qty, item.return_qty, item.unit_price, item.discount_percent, item.discount_value, item.refund_value]);

      // Increase stock quantity
      await client.query(`
        UPDATE items
        SET stock_quantity = stock_quantity + $1
        WHERE id = $2
      `, [item.return_qty, item.item_id]);
    }

    // Reduce customer receivable
    const totalRefund = items.reduce((sum, item) => sum + item.refund_value, 0);
    await client.query(`
      UPDATE customers
      SET op_balance = op_balance - $1
      WHERE id = $2
    `, [totalRefund, customer_id]);

    await client.query('COMMIT');
    res.status(201).json(returnResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// GET all returns
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        sr.*, 
        c.name as customer_name,
        st.name as store_name,
        e.name as employee_name
      FROM sales_returns sr
      LEFT JOIN customers c ON sr.customer_id = c.id
      LEFT JOIN stores st ON sr.store_id = st.id
      LEFT JOIN employees e ON sr.employee_id = e.id
      ORDER BY sr.return_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single return with items
router.get('/:id', async (req, res) => {
  try {
    const returnResult = await pool.query(
      'SELECT * FROM sales_returns WHERE id = $1',
      [req.params.id]
    );
    
    const itemsResult = await pool.query(`
      SELECT 
        sri.*,
        i.code as item_code,
        i.name as item_name
      FROM sales_return_items sri
      LEFT JOIN items i ON sri.item_id = i.id
      WHERE sri.sales_return_id = $1
    `, [req.params.id]);

    res.json({
      return: returnResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
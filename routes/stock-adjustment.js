const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all adjustments
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        sa.*, 
        st.name as store_name,
        e.name as employee_name
      FROM stock_adjustments sa
      LEFT JOIN stores st ON sa.store_id = st.id
      LEFT JOIN employees e ON sa.employee_id = e.id
      WHERE sa.is_active = true
      ORDER BY sa.adjustment_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single adjustment with items
router.get('/:id', async (req, res) => {
  try {
    const adjustmentResult = await pool.query(`
      SELECT 
        sa.*,
        st.name as store_name,
        e.name as employee_name
      FROM stock_adjustments sa
      LEFT JOIN stores st ON sa.store_id = st.id
      LEFT JOIN employees e ON sa.employee_id = e.id
      WHERE sa.id = $1
    `, [req.params.id]);
    
    const itemsResult = await pool.query(`
      SELECT 
        sai.*,
        i.code as item_code,
        i.name as item_name,
        i.stock_quantity as current_system_stock
      FROM stock_adjustment_items sai
      LEFT JOIN items i ON sai.item_id = i.id
      WHERE sai.stock_adjustment_id = $1
    `, [req.params.id]);

    res.json({
      adjustment: adjustmentResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create stock adjustment
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { adjustment_number, adjustment_date, store_id, adjustment_type, description, employee_id, items } = req.body;

    // Insert adjustment header
    const adjustmentResult = await client.query(`
      INSERT INTO stock_adjustments 
      (adjustment_number, adjustment_date, store_id, adjustment_type, description, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [adjustment_number, adjustment_date, store_id, adjustment_type, description, employee_id || null]);

    const adjustmentId = adjustmentResult.rows[0].id;

    // Insert items and update stock
    if (items && items.length > 0) {
      for (const item of items) {
        await client.query(`
          INSERT INTO stock_adjustment_items 
          (stock_adjustment_id, item_id, batch_no, current_stock, adjustment_qty, reason, remarks)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [adjustmentId, item.item_id, item.batch_no || null, item.current_stock || 0, item.adjustment_qty, item.reason || null, item.remarks || null]);

        // Update item stock based on adjustment type
        let adjustmentQty = parseFloat(item.adjustment_qty) || 0;
        if (adjustment_type === 'deduction' || adjustment_type === 'damaged' || adjustment_type === 'loss') {
          adjustmentQty = -Math.abs(adjustmentQty);
        }

        await client.query(`
          UPDATE items
          SET stock_quantity = stock_quantity + $1
          WHERE id = $2
        `, [adjustmentQty, item.item_id]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(adjustmentResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT update adjustment
router.put('/:id', async (req, res) => {
  const { adjustment_type, description } = req.body;
  try {
    const result = await pool.query(`
      UPDATE stock_adjustments
      SET adjustment_type = $1, description = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [adjustment_type, description, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE adjustment (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE stock_adjustments SET is_active = false WHERE id = $1',
      [req.params.id]
    );
    res.json({ message: 'Adjustment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
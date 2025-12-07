const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all purchase returns
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pr.*, 
        s.name as supplier_name,
        st.name as store_name,
        pg.grn_number as grn_reference,
        e.name as employee_name
      FROM purchase_returns pr
      LEFT JOIN suppliers s ON pr.supplier_id = s.id
      LEFT JOIN stores st ON pr.store_id = st.id
      LEFT JOIN purchase_grns pg ON pr.grn_reference_id = pg.id
      LEFT JOIN employees e ON pr.employee_id = e.id
      ORDER BY pr.return_date DESC
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
      'SELECT * FROM purchase_returns WHERE id = $1',
      [req.params.id]
    );
    
    const itemsResult = await pool.query(`
      SELECT 
        pri.*,
        i.code as item_code,
        i.name as item_name
      FROM purchase_return_items pri
      LEFT JOIN items i ON pri.item_id = i.id
      WHERE pri.purchase_return_id = $1
    `, [req.params.id]);

    res.json({
      return: returnResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create purchase return
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { return_number, return_date, supplier_id, store_id, grn_reference_id, return_reason, description, employee_id, items } = req.body;

    // Insert return header
    const returnResult = await client.query(`
      INSERT INTO purchase_returns 
      (return_number, return_date, supplier_id, store_id, grn_reference_id, return_reason, description, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [return_number, return_date, supplier_id, store_id, grn_reference_id, return_reason, description, employee_id]);

    const returnId = returnResult.rows[0].id;
    let totalReturnValue = 0;

    // Insert items and update stock
    for (const item of items) {
      await client.query(`
        INSERT INTO purchase_return_items 
        (purchase_return_id, item_id, batch_no, available_qty, return_qty, cost_price, discount_percent, discount_value, net_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [returnId, item.item_id, item.batch_no, item.available_qty, item.return_qty, item.cost_price, item.discount_percent, item.discount_value, item.net_value]);

      // Decrease item stock quantity (return goods back to supplier)
      await client.query(`
        UPDATE items
        SET stock_quantity = stock_quantity - $1
        WHERE id = $2
      `, [item.return_qty, item.item_id]);

      totalReturnValue += parseFloat(item.net_value) || 0;
    }

    // Reduce supplier payable (they give us credit for returned goods)
    await client.query(`
      UPDATE suppliers
      SET op_balance = op_balance - $1
      WHERE id = $2
    `, [totalReturnValue, supplier_id]);

    await client.query('COMMIT');
    res.status(201).json(returnResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT update return
router.put('/:id', async (req, res) => {
  const { return_reason, description } = req.body;
  try {
    const result = await pool.query(`
      UPDATE purchase_returns
      SET return_reason = $1, description = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [return_reason, description, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE return (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE purchase_returns SET is_active = false WHERE id = $1',
      [req.params.id]
    );
    res.json({ message: 'Return deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

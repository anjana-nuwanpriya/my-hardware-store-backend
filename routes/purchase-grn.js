
// ============================================================================
// FILE: backend/routes/purchase-grn.js
// ============================================================================
const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET all GRNs
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pg.*, 
        s.name as supplier_name,
        st.name as store_name,
        po.po_number as po_reference,
        e.name as employee_name
      FROM purchase_grns pg
      LEFT JOIN suppliers s ON pg.supplier_id = s.id
      LEFT JOIN stores st ON pg.store_id = st.id
      LEFT JOIN purchase_orders po ON pg.po_reference_id = po.id
      LEFT JOIN employees e ON pg.employee_id = e.id
      ORDER BY pg.grn_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single GRN with items
router.get('/:id', async (req, res) => {
  try {
    const grnResult = await pool.query(
      'SELECT * FROM purchase_grns WHERE id = $1',
      [req.params.id]
    );
    
    const itemsResult = await pool.query(`
      SELECT 
        pgi.*,
        i.code as item_code,
        i.name as item_name
      FROM purchase_grn_items pgi
      LEFT JOIN items i ON pgi.item_id = i.id
      WHERE pgi.purchase_grn_id = $1
    `, [req.params.id]);

    res.json({
      grn: grnResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new GRN with items
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { grn_number, grn_date, supplier_id, store_id, po_reference_id, invoice_number, invoice_date, description, employee_id, items } = req.body;

    // Insert GRN header
    const grnResult = await client.query(`
      INSERT INTO purchase_grns 
      (grn_number, grn_date, supplier_id, store_id, po_reference_id, invoice_number, invoice_date, description, employee_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [grn_number, grn_date, supplier_id, store_id, po_reference_id, invoice_number, invoice_date, description, employee_id]);

    const grnId = grnResult.rows[0].id;

    // Insert items and update stock
    for (const item of items) {
      await client.query(`
        INSERT INTO purchase_grn_items 
        (purchase_grn_id, item_id, ordered_qty, batch_no, received_qty, cost_price, discount_percent, discount_value, net_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [grnId, item.item_id, item.ordered_qty, item.batch_no, item.received_qty, item.cost_price, item.discount_percent, item.discount_value, item.net_value]);

      // Update item stock quantity
      await client.query(`
        UPDATE items
        SET stock_quantity = stock_quantity + $1
        WHERE id = $2
      `, [item.received_qty, item.item_id]);
    }

    await client.query('COMMIT');
    res.status(201).json(grnResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PUT update GRN
router.put('/:id', async (req, res) => {
  const { invoice_number, invoice_date, payment_status, description } = req.body;
  try {
    const result = await pool.query(`
      UPDATE purchase_grns
      SET invoice_number = $1, invoice_date = $2, payment_status = $3, description = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [invoice_number, invoice_date, payment_status, description, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

const express = require('express');
const { supabase } = require('../config/database');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// GET all products with inventory
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        inventory (
          quantity_on_hand,
          quantity_reserved,
          quantity_available
        )
      `)
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;

    // Transform data to match frontend expectations
    const transformedData = (data || []).map(product => ({
      ...product,
      inventory: product.inventory ? [{
        quantity: product.inventory[0]?.quantity_on_hand || 0,
        reserved_quantity: product.inventory[0]?.quantity_reserved || 0,
        available_quantity: product.inventory[0]?.quantity_available || 0
      }] : []
    }));
    
    res.json({ products: transformedData });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Add new product
router.post('/', async (req, res) => {
  try {
    const { 
      sku, 
      barcode, 
      name,
      description, 
      cost_price,
      selling_price,
      min_stock_level,
      unit
    } = req.body;

    // Validation
    if (!sku || !name || !cost_price || !selling_price) {
      return res.status(400).json({ 
        error: 'Missing required fields: SKU, Product Name, Cost Price, and Selling Price are required' 
      });
    }

    // Check if SKU already exists
    const { data: existingProduct } = await supabase
      .from('products')
      .select('sku')
      .eq('sku', sku)
      .maybeSingle();

    if (existingProduct) {
      return res.status(400).json({ 
        error: 'A product with this SKU already exists' 
      });
    }

    // Insert product into database
    const { data: productData, error: productError } = await supabase
      .from('products')
      .insert([{
        sku,
        barcode: barcode || null,
        name,
        description: description || null,
        cost_price: parseFloat(cost_price),
        selling_price: parseFloat(selling_price),
        min_stock_level: parseInt(min_stock_level) || 10,
        unit: unit || 'pcs',
        is_active: true
      }])
      .select()
      .single();

    if (productError) {
      console.error('Product insert error:', productError);
      throw productError;
    }

    console.log('✅ Product created:', productData.id, productData.name);

    // Create initial inventory record with CORRECT column names
    const { error: inventoryError } = await supabase
  .from('inventory')
  .insert([{
    product_id: productData.id,
    quantity_on_hand: 0,
    quantity_reserved: 0
    // quantity_available is auto-calculated!
  }]);

    if (inventoryError) {
      console.error('❌ Failed to create inventory record:', inventoryError);
      // Return warning but still consider it a success since product was created
      return res.status(201).json({ 
        message: 'Product added but inventory creation failed',
        product: productData,
        warning: inventoryError.message
      });
    }

    console.log('✅ Inventory created for:', productData.name);

    res.status(201).json({ 
      message: 'Product added successfully',
      product: productData
    });

  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT - Update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from('products')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ 
      message: 'Product updated successfully',
      product: data[0]
    });

  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Soft delete product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('products')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ 
      message: 'Product deleted successfully',
      product: data[0]
    });

  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
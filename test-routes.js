const http = require('http');

const endpoints = [
  '/api/health',
  '/api/stock-adjustment',
  '/api/stores',
  '/api/employees',
  '/api/items'
];

endpoints.forEach(endpoint => {
  http.get(`http://localhost:5000${endpoint}`, (res) => {
    console.log(`✅ ${endpoint}: ${res.statusCode}`);
  }).on('error', (e) => {
    console.log(`❌ ${endpoint}: ${e.message}`);
  });
});
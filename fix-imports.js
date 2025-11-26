const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

let fixedCount = 0;

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix various incorrect import patterns
  const incorrectPatterns = [
    "require('../config/database')",
    "require('..config/database')",
    "require('./config/database')",
    "require('config/database')"
  ];
  
  let modified = false;
  incorrectPatterns.forEach(pattern => {
    if (content.includes(pattern)) {
      content = content.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), "require('../config/database')");
      modified = true;
    }
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed: ${file}`);
    fixedCount++;
  }
});

console.log(`\n✅ Fixed ${fixedCount} files!`);
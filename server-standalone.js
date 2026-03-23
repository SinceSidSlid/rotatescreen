const { startServer } = require('./server');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
const port = config.port || 3000;

startServer(port).then(() => {
  console.log(`Management server running on port ${port}`);
});

const https = require('https');
const fs = require('fs');
const path = require('path');

// Generate self-signed certificate for testing
const { execSync } = require('child_process');

// Create a self-signed certificate if it doesn't exist
try {
  if (!fs.existsSync('server.key') || !fs.existsSync('server.crt')) {
    console.log('Generating self-signed certificate...');
    execSync(`openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes -subj "/C=US/ST=CA/L=SF/O=Test/CN=localhost"`);
  }
} catch (err) {
  console.error('Could not generate certificate:', err.message);
  process.exit(1);
}

const options = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt')
};

const publicPath = path.join(__dirname, 'dist/my-daily-face/browser');

const server = https.createServer(options, (req, res) => {
  let filePath = path.join(publicPath, req.url === '/' ? 'index.html' : req.url);
  
  // Handle Angular routing
  if (!path.extname(filePath) && !fs.existsSync(filePath)) {
    filePath = path.join(publicPath, 'index.html');
  }
  
  const extname = path.extname(filePath);
  let contentType = 'text/html';
  
  switch (extname) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    case '.json':
      contentType = 'application/json';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    case '.ico':
      contentType = 'image/x-icon';
      break;
    case '.webmanifest':
      contentType = 'application/manifest+json';
      break;
  }
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found: ' + filePath);
      } else {
        res.writeHead(500);
        res.end('Server error: ' + err.message);
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    }
  });
});

const PORT = 8443;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`HTTPS Server running at https://localhost:${PORT}/`);
  console.log(`Serving files from: ${publicPath}`);
  console.log('Accept the security warning in your browser to proceed');
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
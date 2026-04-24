const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve all static files from website folder
app.use(express.static(path.join(__dirname, 'website')));

// API routes
app.get('/api', (req, res) => {
  res.json({ message: 'FinGuard AI API' });
});

// Serve SignInPage.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'SignInPage.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`FinGuard AI server running on port ${PORT}`);
});

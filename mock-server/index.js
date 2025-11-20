const express = require('express');
const { createRouter } = require('./routes');

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;

const app = express();
let isOnline = false;

app.use(createRouter(() => isOnline));

const server = app.listen(PORT, () => {
  isOnline = true;
  // eslint-disable-next-line no-console
  console.log(`Mock server listening on http://localhost:${PORT}`);
});

const shutdown = () => {
  server.close(() => {
    isOnline = false;
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);


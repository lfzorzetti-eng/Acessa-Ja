import app from './app.js';
import { getPort } from './src/config.js';

const port = getPort();

app.listen(port, () => {
  console.log(`API e site em http://localhost:${port}`);
});

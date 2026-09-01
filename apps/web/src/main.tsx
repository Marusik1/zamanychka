import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@zamanushka/ui/foundation.css';
import { App } from './app.js';
import './styles/premium-game-motion.css';
import './styles/premium-three.css';
import './styles.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Root element was not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

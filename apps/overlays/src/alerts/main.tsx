import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Alerts } from './Alerts.js';
import '../overlay.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Alerts />
  </StrictMode>,
);

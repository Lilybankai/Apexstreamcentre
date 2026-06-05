import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatBox } from './ChatBox.js';
import '../overlay.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatBox />
  </StrictMode>,
);

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';

// We need to keep Engine accessible or initialize it properly
import Engine from './Engine';

// CSS Imports
import './components/styles/index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

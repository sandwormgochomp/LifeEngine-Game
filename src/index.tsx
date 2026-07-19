import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';

// CSS Imports
import '@fontsource/press-start-2p';
import '@fontsource/vt323';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './components/styles/index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

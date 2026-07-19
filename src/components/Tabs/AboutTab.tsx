import React from 'react';
import styles from '../styles/Hud.module.css';

const AboutTab: React.FC = () => {
  return (
    <div>
      <h3>About The Life Engine</h3>
      <p>
        The Life Engine is an evolution simulator. Cells mutate, breed, and form complex organisms.
        Built with Vite, React, and TypeScript.
      </p>
      <div style={{ marginTop: '20px' }}>
        <a href="https://github.com/Dune/LifeEngine" target="_blank" rel="noreferrer">
          View on GitHub
        </a>
      </div>
    </div>
  );
};

export default AboutTab;

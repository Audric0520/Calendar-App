import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './styles/themes.css';
import './styles/motion.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* `user` makes every motion component honour prefers-reduced-motion */}
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <App />
      </AuthProvider>
    </MotionConfig>
  </React.StrictMode>
);

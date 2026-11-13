import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './styles/themes.css';
import './styles/motion.css';

if (
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator
) {
  const registerServiceWorker = () => {
    try {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Non-fatal: standalone/push readiness is optional
      });
    } catch {
      // Never break app startup if service worker registration throws
    }
  };

  if (document.readyState === 'complete') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true });
  }
}

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

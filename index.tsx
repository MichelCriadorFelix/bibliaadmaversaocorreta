
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);

// Captura global do evento de instalação da PWA para garantir que não seja perdido
// durante navegação ou carregamento rápido.
(window as any).deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).deferredPrompt = e;
});

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
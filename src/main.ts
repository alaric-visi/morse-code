import { mount } from './embed';

// The standalone page: fills the window, welcomes first-time visitors, works offline.
mount(document.getElementById('app')!, { fullPage: true, serviceWorker: true });

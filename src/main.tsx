import {createRoot} from 'react-dom/client';
import App from './App';
import {SettingsProvider} from './settings';
import './style.css';

createRoot(document.getElementById('root')!).render(<SettingsProvider><App/></SettingsProvider>);

import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/patrick-hand/400.css';
import './ui/hud.css';
import './ui/screens.css';
import { Game } from './core/Game.js';
import { installDebug } from './core/Debug.js';

const params = new URLSearchParams(location.search);
const game = new Game({ canvas: document.getElementById('game'), ui: document.getElementById('ui'), params });
installDebug(game);
game.boot().catch((e) => {
  console.error('[game] boot failed', e);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Oops — something went wrong loading the game.';
});

import './styles.css';
import { Game } from './game';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app not found');

const game = new Game(root);
game.start();

if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());

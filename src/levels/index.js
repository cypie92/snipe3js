// Level registry. Order = job-board order. Dev-only levels are hidden unless ?dev=1.
import testrange from './testrange/index.js';

export const LEVELS = [testrange];

export const getLevel = (id) => LEVELS.find((l) => l.id === id);

export const boardLevels = () => {
  const dev = new URLSearchParams(location.search).get('dev') === '1';
  const list = LEVELS.filter((l) => dev || !l.dev);
  return list.length ? list : LEVELS;
};

import { describe, expect, it, vi } from 'vitest';
import { CONTINUE_SECONDS, COUNTDOWN_SECONDS, GameFlow } from '../../src/core/gameFlow';

const flow = (): GameFlow => new GameFlow({ characterCount: 2, stageCount: 1 });

const toRacing = (f: GameFlow): void => {
  f.handle('confirm');
  f.handle('confirm');
  expect(f.handle('confirm')).toEqual({ type: 'startRace' });
  f.update(COUNTDOWN_SECONDS + 0.01);
};

describe('GameFlow', () => {
  it('goes title → character → stage → countdown → racing', () => {
    const f = flow();
    const seen: string[] = [];
    f.onChange((s) => seen.push(s));
    toRacing(f);
    expect(f.screen).toBe('racing');
    expect(seen).toContain('characterSelect');
    expect(seen).toContain('stageSelect');
    expect(seen).toContain('countdown');
    expect(f.simulationRunning).toBe(true);
  });

  it('cycles through characters with wrap-around', () => {
    const f = flow();
    f.handle('confirm');
    f.handle('right');
    expect(f.characterIndex).toBe(1);
    f.handle('right');
    expect(f.characterIndex).toBe(0);
    f.handle('left');
    expect(f.characterIndex).toBe(1);
  });

  it('pointer picks: first tap selects, second confirms', () => {
    const f = flow();
    f.handle('confirm');
    expect(f.pickCharacter(1)).toBeNull();
    expect(f.characterIndex).toBe(1);
    f.pickCharacter(1);
    expect(f.screen).toBe('stageSelect');
    expect(f.pickStage(5)).toBeNull();
    expect(f.pickStage(0)).toEqual({ type: 'startRace' });
  });

  it('navigates back through menus', () => {
    const f = flow();
    f.handle('confirm');
    f.handle('confirm');
    f.handle('back');
    expect(f.screen).toBe('characterSelect');
    f.handle('pause');
    expect(f.screen).toBe('title');
  });

  it('pauses, navigates the pause menu and resumes', () => {
    const f = flow();
    toRacing(f);
    f.handle('pause');
    expect(f.screen).toBe('paused');
    expect(f.simulationRunning).toBe(false);
    f.handle('down');
    expect(f.pauseIndex).toBe(1);
    f.handle('up');
    f.handle('up');
    expect(f.pauseIndex).toBe(2);
    f.handle('pause');
    expect(f.screen).toBe('racing');
  });

  it('restart and quit from pause emit effects', () => {
    const f = flow();
    toRacing(f);
    f.handle('pause');
    expect(f.selectPause('restart')).toEqual({ type: 'restartRace' });
    expect(f.screen).toBe('countdown');
    f.handle('pause');
    expect(f.selectPause('resume')).toBeNull();
    expect(f.screen).toBe('countdown');
    f.handle('pause');
    expect(f.selectPause('quit')).toEqual({ type: 'quitRace' });
    expect(f.screen).toBe('title');
    expect(f.selectPause('quit')).toBeNull();
  });

  it('offers an arcade continue countdown on time up', () => {
    const f = flow();
    toRacing(f);
    f.notifyTimeUp();
    expect(f.screen).toBe('continue');
    expect(f.continueTimer).toBe(CONTINUE_SECONDS);
    const listener = vi.fn();
    f.onChange(listener);
    f.update(1);
    expect(listener).toHaveBeenCalledWith('continue');
    expect(f.handle('confirm')).toEqual({ type: 'continueRace' });
    expect(f.screen).toBe('countdown');
  });

  it('goes to game over when the continue timer runs out', () => {
    const f = flow();
    toRacing(f);
    f.notifyTimeUp();
    f.update(CONTINUE_SECONDS + 1);
    expect(f.screen).toBe('gameOver');
    expect(f.handle('confirm')).toEqual({ type: 'quitRace' });
    expect(f.screen).toBe('title');
  });

  it('declining to continue ends the game', () => {
    const f = flow();
    toRacing(f);
    f.notifyTimeUp();
    f.handle('back');
    expect(f.screen).toBe('gameOver');
  });

  it('finishing shows results; notifications are ignored outside a race', () => {
    const f = flow();
    f.notifyFinished();
    f.notifyTimeUp();
    expect(f.screen).toBe('title');
    toRacing(f);
    f.notifyFinished();
    expect(f.screen).toBe('finished');
  });

  it('unsubscribes listeners', () => {
    const f = flow();
    const l = vi.fn();
    const off = f.onChange(l);
    off();
    f.handle('confirm');
    expect(l).not.toHaveBeenCalled();
  });
});

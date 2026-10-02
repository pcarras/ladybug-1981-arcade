/**
 * Small mutable score holder for the current player.
 *
 * Keeping this outside the Phaser scene makes the HUD a view of semantic game
 * state rather than the place where scoring rules are calculated.
 */
const HIGH_SCORE_KEY = 'ladybug_retro_arcade_high_score';

export class ScoreState {
  private value = 0;
  private highScoreValue = 0;

  public constructor() {
    try {
      const saved = localStorage.getItem(HIGH_SCORE_KEY);
      if (saved) {
        this.highScoreValue = parseInt(saved, 10) || 0;
      }
    } catch {
      // Local storage unavailable
    }
  }

  public get score(): number {
    return this.value;
  }

  public get highScore(): number {
    return Math.max(this.highScoreValue, this.value);
  }

  public reset(): void {
    this.value = 0;
  }

  public addPoints(points: number): void {
    this.value += Math.max(0, Math.floor(points));
    if (this.value > this.highScoreValue) {
      this.highScoreValue = this.value;
      try {
        localStorage.setItem(HIGH_SCORE_KEY, this.highScoreValue.toString());
      } catch {
        // Local storage write ignored
      }
    }
  }
}

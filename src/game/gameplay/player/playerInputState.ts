/**
 * Keyboard and gamepad direction state for the player. It keeps last-pressed-
 * wins behavior separate from the movement motor itself.
 */
import Phaser from 'phaser';
import { readGamepadDirectionState, type GamepadDirectionName } from '../../input/gamepadInput';
import { type Vector2i, VEC2 } from '../math/vector2';

type DirectionName = GamepadDirectionName;

interface DirectionSlot {
  readonly direction: Vector2i;
  keyboardPressed: boolean;
  gamepadPressed: boolean;
  order: number;
}

const KEY_TO_DIRECTION: Readonly<Record<string, DirectionName | undefined>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};

/**
 * Keyboard and gamepad input buffer for the player.
 *
 * The current rule mirrors Godot's PlayerInputState: when several directions are
 * held, the most recently pressed held direction wins. No movement is performed
 * from input events directly; the movement motor reads this state only during
 * fixed simulation ticks.
 */
export class PlayerInputState {
  private sequence = 0;

  private readonly scene: Phaser.Scene;

  private readonly slots: Record<DirectionName, DirectionSlot> = {
    left: { direction: VEC2.left, keyboardPressed: false, gamepadPressed: false, order: 0 },
    right: { direction: VEC2.right, keyboardPressed: false, gamepadPressed: false, order: 0 },
    up: { direction: VEC2.up, keyboardPressed: false, gamepadPressed: false, order: 0 },
    down: { direction: VEC2.down, keyboardPressed: false, gamepadPressed: false, order: 0 },
  };

  private touchDirection: Vector2i = VEC2.zero;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private isPointerDown = false;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => this.handleKeyDown(event));
    scene.input.keyboard?.on('keyup', (event: KeyboardEvent) => this.handleKeyUp(event));

    const onPointerDown = (event: PointerEvent) => {
      // Don't intercept button clicks on the UI
      if ((event.target as HTMLElement)?.closest('button, input, select')) return;
      this.isPointerDown = true;
      this.pointerStartX = event.clientX;
      this.pointerStartY = event.clientY;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!this.isPointerDown) return;
      const dx = event.clientX - this.pointerStartX;
      const dy = event.clientY - this.pointerStartY;
      const threshold = 12; // Responsive sensitivity
      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        if (Math.abs(dx) > Math.abs(dy)) {
          this.touchDirection = dx > 0 ? VEC2.right : VEC2.left;
        } else {
          this.touchDirection = dy > 0 ? VEC2.down : VEC2.up;
        }
        // Continuous tracking anchor: allows smooth diagonal-to-straight L-turns
        this.pointerStartX = event.clientX;
        this.pointerStartY = event.clientY;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate(12); } catch {}
        }
      }
    };

    const onPointerUp = () => {
      this.isPointerDown = false;
    };

    const onVirtualDirection = (event: Event) => {
      const customEvent = event as CustomEvent<{ dir: DirectionName | 'stop' }>;
      const dir = customEvent.detail?.dir;
      if (dir === 'stop') {
        this.touchDirection = VEC2.zero;
      } else if (dir && this.slots[dir]) {
        this.touchDirection = this.slots[dir].direction;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate(15); } catch {}
        }
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    window.addEventListener('ladybug-virtual-direction', onVirtualDirection);

    scene.events.once('shutdown', () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('ladybug-virtual-direction', onVirtualDirection);
    });
  }

  public readPressedDirection(): Vector2i {
    this.pollGamepadDirections();

    let newestSlot: DirectionSlot | undefined;

    for (const slot of Object.values(this.slots)) {
      if (!isSlotPressed(slot)) {
        continue;
      }

      if (newestSlot === undefined || slot.order > newestSlot.order) {
        newestSlot = slot;
      }
    }

    if (newestSlot !== undefined) {
      return newestSlot.direction;
    }

    return this.touchDirection;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const directionName = KEY_TO_DIRECTION[event.code];
    if (directionName === undefined) {
      return;
    }

    const slot = this.slots[directionName];
    this.markKeyboardPressed(slot);
    event.preventDefault();
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const directionName = KEY_TO_DIRECTION[event.code];
    if (directionName === undefined) {
      return;
    }

    this.slots[directionName].keyboardPressed = false;
    event.preventDefault();
  }

  private pollGamepadDirections(): void {
    const gamepadState = readGamepadDirectionState(this.scene);

    for (const directionName of Object.keys(this.slots) as DirectionName[]) {
      this.applyGamepadDirectionState(this.slots[directionName], gamepadState[directionName]);
    }
  }

  private markKeyboardPressed(slot: DirectionSlot): void {
    if (!isSlotPressed(slot)) {
      slot.order = ++this.sequence;
    }

    slot.keyboardPressed = true;
  }

  private applyGamepadDirectionState(slot: DirectionSlot, pressed: boolean): void {
    if (!isSlotPressed(slot) && pressed) {
      slot.order = ++this.sequence;
    }

    slot.gamepadPressed = pressed;
  }
}

function isSlotPressed(slot: DirectionSlot): boolean {
  return slot.keyboardPressed || slot.gamepadPressed;
}

import type { GameActions } from '../game/app';
import type { UiState } from '../game/state';
import type { Store } from '../game/store';
import { WEAPON_IDS, WEAPONS } from '../core/weapons';
import { getLanguage, setLanguage, t } from '../i18n';
import { cssColor, teamColor } from '../render/palette';
import { useStore } from './useStore';

interface Props {
  store: Store<UiState>;
  actions: GameActions;
}

interface ViewProps {
  s: UiState;
  actions: GameActions;
}

export function App({ store, actions }: Props) {
  const s = useStore(store);
  if (s.screen === 'menu') return <Menu actions={actions} />;
  return (
    <div class="play" style={{ '--team': cssColor(teamColor(s.activeTeam)) }}>
      <Hud s={s} actions={actions} />
      <AimHint s={s} />
      {s.toast && (
        <div class="toast" key={s.toast.id} data-testid="toast">
          {s.toast.text}
        </div>
      )}
      <Controls s={s} actions={actions} />
      {s.weaponsOpen && s.overlay === null && <WeaponPanel s={s} actions={actions} />}
      {s.overlay === 'pass' && <PassOverlay s={s} actions={actions} />}
      {s.overlay === 'over' && <OverOverlay s={s} actions={actions} />}
      {s.overlay === 'pause' && <PauseOverlay actions={actions} />}
    </div>
  );
}

function Menu({ actions }: { actions: GameActions }) {
  return (
    <div class="menu" data-testid="menu">
      <h1 class="logo">
        CRATER<span>PULT</span>
      </h1>
      <p class="tagline">{t('app.tagline')}</p>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="start-hotseat"
        onClick={() => actions.startHotseat()}
      >
        <span>{t('menu.hotseat')}</span>
        <small>{t('menu.hotseatSub')}</small>
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="toggle-language"
        onClick={() => setLanguage(getLanguage() === 'en' ? 'hu' : 'en')}
      >
        {t('menu.language')}
      </button>
    </div>
  );
}

function Hud({ s, actions }: ViewProps) {
  const windPct = Math.abs(s.wind) * 10;
  return (
    <div class="hud" data-testid="hud">
      <div class="hud-row">
        <button
          type="button"
          class="icon-btn"
          aria-label={t('pause.title')}
          data-testid="pause"
          onClick={() => actions.pause()}
        >
          ❚❚
        </button>
        <div class="turn">
          <span class="turn-name">{t('hud.turnOf', { team: s.activeName })}</span>
          <span
            class={`turn-time${s.turnSeconds <= 5 && s.phase === 'aiming' ? ' is-low' : ''}`}
            data-testid="turn-time"
          >
            {s.phase === 'aiming' ? t('hud.time', { seconds: s.turnSeconds }) : '…'}
          </span>
        </div>
        <div class="wind" data-testid="wind" aria-label={`${t('hud.wind')} ${s.wind}`}>
          <span class="wind-label">{t('hud.wind')}</span>
          <span class="wind-bar">
            <span
              class={`wind-fill ${s.wind < 0 ? 'is-left' : 'is-right'}`}
              style={{ width: `${windPct / 2}%` }}
            />
          </span>
        </div>
      </div>
      <div class="teams">
        {s.teams.map((tm) => (
          <div
            class={`team${tm.id === s.activeTeam ? ' is-active' : ''}`}
            key={tm.id}
            style={{ '--c': cssColor(teamColor(tm.id)) }}
          >
            <span class="team-name">{tm.name}</span>
            <span class="team-bar">
              <span
                class="team-fill"
                style={{ width: `${(100 * tm.hp) / Math.max(1, tm.maxHp)}%` }}
              />
            </span>
            <span class="team-hp" data-testid={`team-hp-${tm.id}`}>
              {tm.hp}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldButton({
  label,
  onDown,
  onUp,
  disabled,
  children,
  testId,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
  disabled: boolean;
  children: preact.ComponentChildren;
  testId: string;
}) {
  return (
    <button
      type="button"
      class="ctl"
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onPointerDown={(e) => {
        onDown();
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // Synthetic events have no capturable pointer; the release handlers still apply.
        }
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
    >
      {children}
    </button>
  );
}

function Controls({ s, actions }: ViewProps) {
  const busy = s.overlay !== null;
  return (
    <div class="controls" data-testid="controls">
      <div class="ctl-group">
        <HoldButton
          label={t('controls.left')}
          testId="move-left"
          disabled={busy || !s.canMove}
          onDown={() => actions.move(-1)}
          onUp={() => actions.move(0)}
        >
          ◀
        </HoldButton>
        <HoldButton
          label={t('controls.right')}
          testId="move-right"
          disabled={busy || !s.canMove}
          onDown={() => actions.move(1)}
          onUp={() => actions.move(0)}
        >
          ▶
        </HoldButton>
        <button
          type="button"
          class="ctl"
          aria-label={t('controls.jump')}
          data-testid="jump"
          disabled={busy || !s.canMove}
          onClick={() => actions.jump()}
        >
          ⤴
        </button>
        <button
          type="button"
          class="ctl"
          aria-label={t('controls.backflip')}
          data-testid="backflip"
          disabled={busy || !s.canMove}
          onClick={() => actions.backflip()}
        >
          ↺
        </button>
      </div>
      <div class="ctl-group">
        {WEAPONS[s.weapon].fuse && (
          <button
            type="button"
            class="ctl ctl-wide"
            data-testid="fuse"
            disabled={busy}
            onClick={() => actions.setFuse((s.fuse % 5) + 1)}
          >
            {t('controls.fuse', { seconds: s.fuse })}
          </button>
        )}
        {s.weapon === 'girder' && (
          <button
            type="button"
            class="ctl ctl-wide"
            data-testid="tilt"
            disabled={busy}
            onClick={() => actions.cycleGirderAngle()}
          >
            {t('controls.tilt', { deg: s.girderAngle / 10 })}
          </button>
        )}
        {WEAPONS[s.weapon].aim === 'place' && (
          <button
            type="button"
            class="ctl ctl-wide ctl-use"
            data-testid="use"
            disabled={busy || !s.canFire}
            onClick={() => actions.use()}
          >
            {t('controls.use')}
          </button>
        )}
        <button
          type="button"
          class="ctl ctl-wide ctl-weapon"
          data-testid="weapon"
          disabled={busy}
          onClick={() => actions.toggleWeapons()}
        >
          <WeaponIcon id={s.weapon} />
          {t(`weapon.${s.weapon}`)}
        </button>
        <button
          type="button"
          class="ctl"
          aria-label={t('controls.skip')}
          data-testid="skip"
          disabled={busy || !s.canMove}
          onClick={() => actions.skip()}
        >
          ⏭
        </button>
      </div>
    </div>
  );
}

function AimHint({ s }: { s: UiState }) {
  if (s.overlay !== null || !s.canFire) return null;
  const aim = WEAPONS[s.weapon].aim;
  if (aim === 'target') {
    return (
      <div class="aim-hint" data-testid="target-hint">
        {t('controls.targetHint')}
      </div>
    );
  }
  if ((aim === 'arc' || aim === 'direction') && s.showAimHint) {
    return (
      <div class="aim-hint" data-testid="aim-hint">
        {t('controls.aimHint')}
      </div>
    );
  }
  return null;
}

function WeaponPanel({ s, actions }: ViewProps) {
  return (
    <div class="sheet-backdrop" onClick={() => actions.toggleWeapons(false)}>
      <div class="sheet" data-testid="weapon-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{t('controls.weapon')}</h2>
        <div class="weapon-grid">
          {WEAPON_IDS.map((w) => {
            const info = s.weaponInfo[w];
            const locked = info ? !info.unlocked : false;
            const empty = info ? info.ammo === 0 : false;
            return (
              <button
                type="button"
                key={w}
                class={`weapon-cell${w === s.weapon ? ' is-selected' : ''}`}
                data-testid={`weapon-${w}`}
                disabled={locked || empty}
                aria-label={`${t(`weapon.${w}`)}. ${t(`weapon.${w}.desc`)}`}
                onClick={() => actions.selectWeapon(w)}
              >
                <WeaponIcon id={w} />
                <span class="weapon-name">{t(`weapon.${w}`)}</span>
                <span class="weapon-ammo">
                  {locked
                    ? t('weapon.fromTurn', { turn: info?.fromTurn ?? 1 })
                    : info && info.ammo >= 0
                      ? t('weapon.ammo', { count: info.ammo })
                      : '∞'}
                </span>
              </button>
            );
          })}
        </div>
        <p class="weapon-desc" data-testid="weapon-desc">
          {t(`weapon.${s.weapon}.desc`)}
        </p>
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  bazooka: 'M3 14h13l3-3h2v6h-2l-3-3M6 14v3',
  grenade: 'M12 8a6 6 0 1 0 .01 0M12 8V5h3',
  shotgun: 'M2 11h16v3H8l-2 4H3l1-4H2zM18 12h4',
  cluster: 'M9 9a4 4 0 1 0 .01 0M17 6h.01M19 11h.01M16 16h.01M9 4V2',
  mortar: 'M5 19l4-9h6l4 9zM10 10l2-6 2 6',
  napalm: 'M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-2-1-4 0-6z',
  homing: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 .01 0',
  airstrike: 'M4 6h16M8 6l-2 4M12 6v5M16 6l2 4M6 14v4M12 15v5M18 14v4',
  dynamite: 'M9 9h6v12H9zM12 9V6l3-3',
  mine: 'M5 17h14v-3a7 7 0 0 0-14 0zM12 7V4',
  crawler: 'M4 15a8 5 0 1 0 16 0 8 5 0 1 0-16 0M17 13h.01M7 20l-1 2M17 20l1 2',
  punch: 'M5 10h9a3 3 0 0 1 0 6H8a3 3 0 0 1-3-3zM14 10V7M11 10V7M8 10V8',
  drill: 'M3 12h8l3-4 7 4-7 4-3-4',
  girder: 'M2 10h20v4H2zM6 10l4 4M10 10l4 4M14 10l4 4',
  teleport: 'M12 4a8 8 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0',
  quake: 'M2 14l4-4 3 6 4-10 3 8 2-3h4',
};

function WeaponIcon({ id }: { id: string }) {
  return (
    <svg class="wicon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[id] ?? ICONS.bazooka} />
    </svg>
  );
}

function PassOverlay({ s, actions }: ViewProps) {
  return (
    <div class="overlay" data-testid="pass" onClick={() => actions.passReady()}>
      <div class="panel">
        <div class="team-chip" />
        <h2>{t('pass.title', { team: s.activeName })}</h2>
        <p>{t('pass.body')}</p>
        <button type="button" class="btn btn-primary" data-testid="pass-go">
          {t('pass.go')}
        </button>
      </div>
    </div>
  );
}

function OverOverlay({ s, actions }: ViewProps) {
  const winner = s.teams.find((tm) => tm.id === s.winner);
  return (
    <div class="overlay" data-testid="game-over">
      <div class="panel" style={winner ? { '--team': cssColor(teamColor(winner.id)) } : undefined}>
        <h2 class="win-title">{winner ? t('over.win', { team: winner.name }) : t('over.draw')}</h2>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="rematch"
          onClick={() => actions.rematch()}
        >
          {t('over.rematch')}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="to-menu"
          onClick={() => actions.toMenu()}
        >
          {t('over.menu')}
        </button>
      </div>
    </div>
  );
}

function PauseOverlay({ actions }: { actions: GameActions }) {
  return (
    <div class="overlay" data-testid="pause-overlay">
      <div class="panel">
        <h2>{t('pause.title')}</h2>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="resume"
          onClick={() => actions.resume()}
        >
          {t('pause.resume')}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="quit"
          onClick={() => actions.toMenu()}
        >
          {t('pause.quit')}
        </button>
      </div>
    </div>
  );
}

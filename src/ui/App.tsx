import type { GameActions } from '../game/app';
import type { UiState } from '../game/state';
import type { Store } from '../game/store';
import { WEAPON_IDS } from '../core/weapons';
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
      {s.overlay === null && s.showAimHint && s.canFire && (
        <div class="aim-hint" data-testid="aim-hint">
          {t('controls.aimHint')}
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
        {s.weapon === 'grenade' && (
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

function WeaponPanel({ s, actions }: ViewProps) {
  return (
    <div class="sheet-backdrop" onClick={() => actions.toggleWeapons(false)}>
      <div class="sheet" data-testid="weapon-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{t('controls.weapon')}</h2>
        {WEAPON_IDS.map((w) => (
          <button
            type="button"
            key={w}
            class={`weapon-row${w === s.weapon ? ' is-selected' : ''}`}
            data-testid={`weapon-${w}`}
            onClick={() => actions.selectWeapon(w)}
          >
            <WeaponIcon id={w} />
            <span class="weapon-text">
              <b>{t(`weapon.${w}`)}</b>
              <small>{t(`weapon.${w}.desc`)}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function WeaponIcon({ id }: { id: string }) {
  return (
    <svg class="wicon" viewBox="0 0 24 24" aria-hidden="true">
      {id === 'bazooka' && <path d="M3 14h13l3-3h2v6h-2l-3-3M6 14v3" />}
      {id === 'grenade' && (
        <>
          <circle cx="12" cy="14" r="6" />
          <path d="M12 8V5h3" />
        </>
      )}
      {id === 'shotgun' && <path d="M2 11h16v3H8l-2 4H3l1-4H2zM18 12h4" />}
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

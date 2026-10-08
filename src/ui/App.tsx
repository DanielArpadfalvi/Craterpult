import type { GameActions } from '../game/app';
import type { UiState } from '../game/state';
import type { Store } from '../game/store';
import { WEAPON_IDS, WEAPONS } from '../core/weapons';
import { t } from '../i18n';
import { CampaignScreen } from './Campaign';
import { WeaponIcon } from './icons';
import { Menu, QuickScreen } from './Menu';
import { DesyncOverlay, OnlineScreen, ReplayBar, WaitingOverlay } from './Online';
import { PaywallSheet } from './Paywall';
import { ResultOverlay } from './Result';
import { SettingsScreen } from './Settings';
import { StatsScreen } from './Stats';
import { TeamScreen } from './Team';
import { useStore } from './useStore';
import { windText } from './wind';

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
  return (
    <>
      <Screens s={s} actions={actions} />
      {s.paywall.open && <PaywallSheet s={s} actions={actions} />}
    </>
  );
}

function Screens({ s, actions }: ViewProps) {
  const sheet = s.sheet && <SheetView s={s} actions={actions} />;
  // Over the menus a sheet replaces the screen; over a match it covers the paused game.
  if (sheet && s.screen !== 'playing') return sheet;
  if (s.screen === 'menu') return <Menu s={s} actions={actions} />;
  if (s.screen === 'campaign') return <CampaignScreen s={s} actions={actions} />;
  return (
    <div class="play" style={{ '--team': s.activeColor }}>
      <Hud s={s} actions={actions} />
      <ReplayBar s={s} actions={actions} />
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
      {s.overlay === 'pause' && <PauseOverlay s={s} actions={actions} />}
      {s.overlay === 'result' && <ResultOverlay s={s} actions={actions} />}
      {s.overlay === 'waiting' && <WaitingOverlay s={s} actions={actions} />}
      {s.overlay === 'desync' && <DesyncOverlay s={s} actions={actions} />}
      {sheet}
    </div>
  );
}

function SheetView({ s, actions }: ViewProps) {
  switch (s.sheet) {
    case 'settings':
      return <SettingsScreen s={s} actions={actions} />;
    case 'stats':
      return <StatsScreen s={s} actions={actions} />;
    case 'team':
      return <TeamScreen s={s} actions={actions} />;
    case 'quick':
      return <QuickScreen s={s} actions={actions} />;
    case 'online':
      return <OnlineScreen s={s} actions={actions} />;
    default:
      return null;
  }
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
          <span class="turn-name">
            {s.botThinking
              ? t('hud.botThinking', { team: s.activeName })
              : t('hud.turnOf', { team: s.activeName })}
          </span>
          <span
            class={`turn-time${s.turnSeconds <= 5 && s.phase === 'aiming' ? ' is-low' : ''}`}
            data-testid="turn-time"
          >
            {s.phase === 'aiming' ? t('hud.time', { seconds: s.turnSeconds }) : '…'}
          </span>
        </div>
        <div class="wind" data-testid="wind" aria-label={`${t('hud.wind')} ${windText(s.wind)}`}>
          <span class="wind-label">
            {t('hud.wind')}{' '}
            <b class="wind-value" data-testid="wind-value">
              {windText(s.wind)}
            </b>
          </span>
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
            style={{ '--c': tm.color }}
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
      <div class="panel" style={winner ? { '--team': winner.color } : undefined}>
        <h2 class="win-title">{winner ? t('over.win', { team: winner.name }) : t('over.draw')}</h2>
        {s.mode === 'online' && s.online.matchId && (
          <button
            type="button"
            class="btn btn-primary"
            data-testid="online-over-rematch"
            disabled={s.online.busy}
            onClick={() => void actions.onlineRematch(s.online.matchId as string)}
          >
            {t('over.rematch')}
          </button>
        )}
        <button
          type="button"
          class={`btn ${s.mode === 'online' ? 'btn-ghost' : 'btn-primary'}`}
          data-testid="rematch"
          onClick={() => actions.rematch()}
        >
          {s.mode === 'online' ? t('online.toList') : t('over.rematch')}
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

function PauseOverlay({ s, actions }: ViewProps) {
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
        {s.mode !== 'online' && (
          <button
            type="button"
            class="btn btn-ghost"
            data-testid="restart"
            onClick={() => actions.restart()}
          >
            {t('pause.restart')}
          </button>
        )}
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="pause-settings"
          onClick={() => actions.openSheet('settings')}
        >
          {t('pause.settings')}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="quit"
          onClick={() =>
            s.mode === 'campaign'
              ? actions.toMissions()
              : s.mode === 'online'
                ? actions.onlineLeave()
                : actions.toMenu()
          }
        >
          {t('pause.quit')}
        </button>
      </div>
    </div>
  );
}

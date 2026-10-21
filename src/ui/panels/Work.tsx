// Work: the job board. Each job is a 90-second mini-game you play alone or together, with its
// own level; every level makes the job harder and pays more. The flower shop and Bug Squad open
// after a few café shifts, delivery after the flower shop and Inbox Zero after Bug Squad,
// counted per person (a together shift counts for both of you). A solo shift interrupted by
// closing the app picks up where it left off.

import { useMemo, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { SHIFT, jobLevel, shiftEstimate, xpForLevel } from '../../data/economy';
import { JOB_KEYS, JOBS, jobLock, jobXp, shiftsWorked, type JobKey } from '../../data/jobs';
import { act, backend, couple, partner, partnerOnline, snap, toast } from '../../state/store';
import { CafeShift, cafeBackdrop } from '../jobs/Cafe';
import { BugShift, bugsThumb } from '../jobs/Bugs';
import type { Role, ShiftProgress, ShiftProps } from '../jobs/common';
import { InboxShift, inboxThumb } from '../jobs/Inbox';
import { DeliveryShift, streetThumb } from '../jobs/Delivery';
import { FlowerShift, flowerBackdrop } from '../jobs/Flowers';
import { Coin, Icon, Sheet } from '../kit';

const GAMES: Record<JobKey, { Shift: (p: ShiftProps) => preact.JSX.Element; thumb: () => HTMLCanvasElement }> = {
  cafe: { Shift: CafeShift, thumb: cafeBackdrop },
  flowers: { Shift: FlowerShift, thumb: flowerBackdrop },
  delivery: { Shift: DeliveryShift, thumb: streetThumb },
  bugs: { Shift: BugShift, thumb: bugsThumb },
  inbox: { Shift: InboxShift, thumb: inboxThumb },
};

/** The solo shift in progress, saved as it runs so closing the app doesn't lose it. */
const LIVE_KEY = 'oph.liveShift';
interface LiveShift extends ShiftProgress { id: string; job: JobKey; savedAt: number }

export function savedShift(): LiveShift | null {
  try {
    const v = JSON.parse(localStorage.getItem(LIVE_KEY) ?? 'null') as LiveShift | null;
    // The server only pays a shift for a while after it started; older ones are gone.
    if (!v || !JOBS[v.job] || Date.now() - v.savedAt > 30 * 60_000 || v.t >= SHIFT.shiftSeconds - 1) return null;
    return v;
  } catch { return null; }
}
const clearSaved = () => { try { localStorage.removeItem(LIVE_KEY); } catch { /* private mode */ } };

interface Result { job: JobKey; pay: number; level: number; levelUp: boolean; opened: JobKey | null; openedAll?: JobKey[]; served: number; missed: number }

export function Work({ onClose, joinShift }: { onClose: () => void; joinShift: { id: string; job: JobKey } | null }) {
  const [shift, setShift] = useState<{ id: string; job: JobKey; role: Role; resume?: ShiftProgress } | null>(() => {
    if (joinShift) return { ...joinShift, role: 'guest' };
    const saved = savedShift();
    return saved ? { id: saved.id, job: saved.job, role: 'solo', resume: saved } : null;
  });
  const lastSave = useRef(0);
  const [result, setResult] = useState<Result | null>(null);
  const [pick, setPick] = useState<JobKey>(() => lastJob());

  const start = async (job: JobKey, together: boolean) => {
    if (together && !partnerOnline.value) { toast(`${partner.value?.name ?? 'Your partner'} isn’t here right now.`, 'error'); return; }
    const s = (await act('shift_start', { together, job })) as { id: string } | undefined;
    if (!s) return;
    sfx('bell');
    if (together) backend.send({ t: 'invite', what: 'shift', ref: s.id, job });
    try { localStorage.setItem('oph.job', job); } catch { /* private mode */ }
    setResult(null);
    clearSaved();
    setShift({ id: s.id, job, role: together ? 'host' : 'solo' });
  };

  if (shift) {
    const { Shift } = GAMES[shift.job];
    return (
      <Sheet title={JOBS[shift.job].place} onClose={() => { if (confirm('Leave the shift? You won’t be paid for it.')) { clearSaved(); setShift(null); onClose(); } }} size="full">
        <Shift id={shift.id} role={shift.role} level={jobLevel(jobXp(couple.value, shift.job))} resume={shift.resume} onTick={(p) => {
          if (shift.role !== 'solo' || performance.now() - lastSave.current < 1000) return;
          lastSave.current = performance.now();
          try { localStorage.setItem(LIVE_KEY, JSON.stringify({ ...p, id: shift.id, job: shift.job, savedAt: Date.now() } satisfies LiveShift)); } catch { /* private mode */ }
        }} onEnd={async (served, missed) => {
          clearSaved();
          const r = (await act('shift_finish', { shiftId: shift.id, served, missed })) as Omit<Result, 'served' | 'missed'> | undefined;
          setShift(null);
          if (r) { setResult({ ...r, served, missed }); setPick(r.opened ?? r.job); sfx(r.levelUp || r.opened ? 'win' : 'coin'); }
        }} />
      </Sheet>
    );
  }

  const today = snap.value?.today ?? {};
  const worked = today.shifts ?? 0;
  return (
    <Sheet title="Work" onClose={onClose}>
      <div class="col">
        {result && <ResultCard r={result} />}
        {JOB_KEYS.map((k) => <JobCard job={k} open={pick === k} onOpen={() => { sfx('tap'); setPick(k); }} onStart={(t) => start(k, t)} earned={today[k] ?? 0} />)}
        <span class="tiny muted center">
          {worked < SHIFT.softCap ? `Pay is lower after ${SHIFT.softCap} shifts a day, all jobs together. ${worked ? `${worked} today.` : ''}` : `You’ve worked ${worked} shifts today, so pay is lower until tomorrow.`}
        </span>
      </div>
    </Sheet>
  );
}

function lastJob(): JobKey {
  try {
    const k = localStorage.getItem('oph.job') as JobKey | null;
    if (k && JOBS[k] && !jobLock(snap.value?.me, k)) return k;
  } catch { /* private mode */ }
  return 'cafe';
}

function ResultCard({ r }: { r: Result }) {
  const J = JOBS[r.job];
  return (
    <div class="item white col center" style={{ alignItems: 'stretch' }}>
      <span>Shift done! {r.served} {r.served === 1 ? J.unit[0] : J.unit[1]}{r.missed ? `, ${r.missed} missed` : ''}.</span>
      <div class="code pbox"><Coin n={`+${r.pay}`} size="" /></div>
      {r.levelUp && <span class="chip" style={{ alignSelf: 'center' }}><Icon name="star" size="s" />{J.name} level {r.level}! Pay goes up.</span>}
      {(r.openedAll ?? (r.opened ? [r.opened] : [])).map((k) => <span class="chip" style={{ alignSelf: 'center' }}><Icon name="sparkle" size="s" />New job: {JOBS[k].place} is hiring you</span>)}
    </div>
  );
}

function JobCard({ job, open, onOpen, onStart, earned }: { job: JobKey; open: boolean; onOpen: () => void; onStart: (together: boolean) => void; earned: number }) {
  const J = JOBS[job];
  const me = snap.value?.me;
  const lock = jobLock(me, job);
  const xp = jobXp(couple.value, job);
  const level = jobLevel(xp);
  const prev = xpForLevel(level), next = xpForLevel(level + 1);
  const thumb = useMemo(() => GAMES[job].thumb().toDataURL(), [job]);
  const done = shiftsWorked(me, lock?.after ?? job);
  const need = J.unlock?.shifts ?? 0;
  return (
    <div class={`job-card pbox ${lock ? 'locked' : ''}`} aria-expanded={open && !lock}>
      <button class="job-head" onClick={onOpen} disabled={!!lock}>
        <img class="px" src={thumb} alt="" />
        <div class="grow col" style={{ gap: '4px', minWidth: 0 }}>
          <span class="row" style={{ gap: '6px' }}>{J.place}{lock && <Icon name="lock" size="s" alt="Locked" />}</span>
          {lock ? (
            <>
              <span class="tiny muted">Opens after {need} {JOBS[lock.after].name.toLowerCase()} shifts</span>
              <div class="meter"><i style={{ width: `${Math.round((done / need) * 100)}%` }} /></div>
              <span class="tiny muted">{done} of {need} done</span>
            </>
          ) : (
            <>
              <span class="tiny muted">Level {level}{earned ? <> · today <Coin n={`+${earned}`} size="s" /></> : ''}</span>
              <div class="meter"><i style={{ width: `${level >= SHIFT.maxLevel ? 100 : Math.round(((xp - prev) / (next - prev)) * 100)}%` }} /></div>
              <span class="tiny muted">{level >= SHIFT.maxLevel ? 'Top level' : `${Math.ceil((next - xp) / J.xpPerOrder)} ${J.unit[1]} to level ${level + 1}`}</span>
            </>
          )}
        </div>
      </button>
      {open && !lock && (
        <div class="col" style={{ gap: '8px', padding: '0 10px 10px' }}>
          <p class="small" style={{ margin: 0 }}>{J.blurb}</p>
          <button class="btn block" onClick={() => onStart(false)}><Icon name="work" size="s" />Work solo · up to <Coin n={shiftEstimate(J.pay, level, false)} /></button>
          <button class="btn block" disabled={!partner.value} onClick={() => onStart(true)}><Icon name="heart" size="s" />Work together · up to <Coin n={shiftEstimate(J.pay, level, true)} /> each</button>
          {level < SHIFT.maxLevel && <span class="tiny muted center">Level {level + 1} pays up to <Coin n={shiftEstimate(J.pay, level + 1, false)} size="s" /> solo, with busier shifts.</span>}
          {partner.value && <span class="tiny muted center">{partnerOnline.value ? `Together: you take the ${J.roles[0]}, ${partner.value.name} takes the ${J.roles[1]}.` : `Together shifts need ${partner.value.name} online.`}</span>}
        </div>
      )}
    </div>
  );
}

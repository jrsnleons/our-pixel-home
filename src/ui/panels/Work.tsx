// Work: the job board. Each job is a three-minute mini-game you play alone or together, with
// its own level. The flower shop opens after a few café shifts and delivery after a few
// flower shop shifts, counted per person (a together shift counts for both of you).

import { useMemo, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { SHIFT, jobLevel, xpForLevel } from '../../data/economy';
import { JOB_KEYS, JOBS, jobLock, jobXp, shiftsWorked, type JobKey } from '../../data/jobs';
import { act, backend, couple, partner, partnerOnline, snap, toast } from '../../state/store';
import { CafeShift, cafeBackdrop } from '../jobs/Cafe';
import type { Role, ShiftProps } from '../jobs/common';
import { DeliveryShift, streetThumb } from '../jobs/Delivery';
import { FlowerShift, flowerBackdrop } from '../jobs/Flowers';
import { Coin, Icon, Sheet } from '../kit';

const GAMES: Record<JobKey, { Shift: (p: ShiftProps) => preact.JSX.Element; thumb: () => HTMLCanvasElement }> = {
  cafe: { Shift: CafeShift, thumb: cafeBackdrop },
  flowers: { Shift: FlowerShift, thumb: flowerBackdrop },
  delivery: { Shift: DeliveryShift, thumb: streetThumb },
};

interface Result { job: JobKey; pay: number; level: number; levelUp: boolean; opened: JobKey | null; served: number; missed: number }

export function Work({ onClose, joinShift }: { onClose: () => void; joinShift: { id: string; job: JobKey } | null }) {
  const [shift, setShift] = useState<{ id: string; job: JobKey; role: Role } | null>(joinShift ? { ...joinShift, role: 'guest' } : null);
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
    setShift({ id: s.id, job, role: together ? 'host' : 'solo' });
  };

  if (shift) {
    const { Shift } = GAMES[shift.job];
    return (
      <Sheet title={JOBS[shift.job].place} onClose={() => { if (confirm('Leave the shift? You won’t be paid for it.')) { setShift(null); onClose(); } }} size="full">
        <Shift id={shift.id} role={shift.role} onEnd={async (served, missed) => {
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
      {r.opened && <span class="chip" style={{ alignSelf: 'center' }}><Icon name="sparkle" size="s" />New job: {JOBS[r.opened].place} is hiring you</span>}
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
          <button class="btn block" onClick={() => onStart(false)}><Icon name="work" size="s" />Work solo · about <Coin n={SHIFT.soloPay} /></button>
          <button class="btn block" disabled={!partner.value} onClick={() => onStart(true)}><Icon name="heart" size="s" />Work together · about <Coin n={SHIFT.togetherPayEach} /> each</button>
          {partner.value && <span class="tiny muted center">{partnerOnline.value ? `Together: you take the ${J.roles[0]}, ${partner.value.name} takes the ${J.roles[1]}.` : `Together shifts need ${partner.value.name} online.`}</span>}
        </div>
      )}
    </div>
  );
}

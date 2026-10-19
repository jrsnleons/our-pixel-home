// Connect 4, Tic-Tac-Toe and Draw & Guess. Moves go to the server, which referees; the
// partner's moves arrive as data updates. Drawing strokes travel live between phones.

import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { DIMS } from '../../core/boardgames';
import { DRAW_SECONDS } from '../../data/words';
import type { Game, GameKind, LiveMsg } from '../../net/types';
import { act, backend, me, partner, snap, toast } from '../../state/store';
import { Icon, Sheet } from '../kit';
import { onStrokes } from '../screens/Home';

const TITLE: Record<GameKind, string> = { connect4: 'Connect 4', tictactoe: 'Tic-Tac-Toe', draw: 'Draw & Guess' };

export function GameSheet({ gameId, kind, onClose }: { gameId: string | null; kind: GameKind; onClose: () => void }) {
  const games = snap.value?.games ?? [];
  const g = (gameId ? games.find((x) => x.id === gameId) : undefined) ?? [...games].reverse().find((x) => x.kind === kind);
  const [id, setId] = useState(g?.id ?? null);
  const game = games.find((x) => x.id === id) ?? g;
  const again = async () => {
    const nid = (await act('game_start', { kind })) as string | undefined;
    if (nid) { setId(nid); backend.send({ t: 'invite', what: kind === 'draw' ? 'draw' : 'play', kind, ref: nid }); }
  };
  return (
    <Sheet title={TITLE[kind]} onClose={onClose} size="tall">
      {!game ? <div class="empty">Waiting for the game to start…</div>
        : kind === 'draw' ? <DrawGuess g={game} onAgain={again} /> : <Board g={game} onAgain={again} />}
    </Sheet>
  );
}

function Status({ g }: { g: Game }) {
  const myId = me.value!.id;
  const them = partner.value?.name ?? 'Partner';
  if (g.status === 'live') return <p class="center" style={{ margin: '4px 0 10px' }}>{g.turn === myId ? 'Your turn' : `${them}’s turn…`}</p>;
  if (g.status === 'draw') return <p class="center" style={{ margin: '4px 0 10px' }}>A draw. Perfectly matched.</p>;
  if (g.status === 'resigned') return <p class="center" style={{ margin: '4px 0 10px' }}>{g.winner === myId ? `${them} left the game.` : 'You left the game.'}</p>;
  return <p class="center" style={{ margin: '4px 0 10px' }}>{g.winner === myId ? 'You win! 🎉' : `${them} wins!`}</p>;
}

function Board({ g, onAgain }: { g: Game; onAgain: () => void }) {
  const myId = me.value!.id;
  const { cols, rows } = DIMS[g.kind as 'connect4' | 'tictactoe'];
  const prev = useRef<number[]>(g.board);
  const [fresh, setFresh] = useState<number>(-1);
  const prevStatus = useRef(g.status);
  useEffect(() => {
    const i = g.board.findIndex((v, k) => v !== 0 && prev.current[k] === 0);
    if (i >= 0) { setFresh(i); sfx('place'); }
    prev.current = g.board.slice();
    if (prevStatus.current === 'live' && g.status !== 'live') sfx(g.winner === myId ? 'win' : 'pop');
    prevStatus.current = g.status;
  }, [g.board.join(''), g.status]);
  const mine = g.p1 === myId ? 1 : 2;
  const play = async (mv: number) => {
    if (g.status !== 'live' || g.turn !== myId) { if (g.status === 'live') toast(`It’s ${partner.value?.name ?? 'their'}’s turn.`); return; }
    await act('game_move', { gameId: g.id, move: mv });
  };
  const ttt = g.kind === 'tictactoe';
  return (
    <div class="col">
      <div class="row" style={{ justifyContent: 'center' }}>
        <span class="chip"><span class={`cell p${mine}`} style={{ width: '14px', height: '14px', display: 'inline-block', borderRadius: ttt ? 0 : '50%' }}>{ttt ? '' : ''}</span>You {ttt ? (mine === 1 ? '✕' : '○') : ''}</span>
        <span class="chip"><span class={`cell p${mine === 1 ? 2 : 1}`} style={{ width: '14px', height: '14px', display: 'inline-block', borderRadius: ttt ? 0 : '50%' }} />{partner.value?.name} {ttt ? (mine === 1 ? '○' : '✕') : ''}</span>
      </div>
      <Status g={g} />
      <div class={`board ${ttt ? 'ttt' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, width: ttt ? '78%' : '100%' }}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const v = g.board[i];
          const col = i % cols;
          const cls = ttt ? '' : v ? `p${v}` : '';
          return (
            <button class={`cell ${cls} ${g.winCells.includes(i) ? 'win' : ''} ${i === fresh && !ttt ? 'drop' : ''}`} onClick={() => play(ttt ? i : col)} aria-label={`Cell ${i + 1}`}>
              {ttt && v ? <span style={{ color: v === 1 ? '#E8414A' : '#3A7AC8' }}>{v === 1 ? '✕' : '○'}</span> : null}
            </button>
          );
        })}
      </div>
      {g.status === 'live'
        ? <button class="btn ghost small" onClick={() => { if (confirm('Leave this game?')) void act('game_resign', { gameId: g.id }); }}>Leave game</button>
        : <button class="btn block" onClick={onAgain}>Play again</button>}
    </div>
  );
}

// ---------- Draw & Guess ----------

type Stroke = { pts: number[]; color: string; size: number };
const INKS = ['#2A2A3A', '#E8414A', '#3A7AC8', '#4AA85A', '#F2C230', '#A0522D'];

function DrawGuess({ g, onAgain }: { g: Game; onAgain: () => void }) {
  const myId = me.value!.id;
  const drawing = g.drawer === myId && g.status === 'live';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const [word, setWord] = useState('');
  const [guess, setGuess] = useState('');
  const [ink, setInk] = useState(INKS[0]);
  const [left, setLeft] = useState(DRAW_SECONDS);
  const roundKey = `${g.id}:${g.round}`;

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFFDF6'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of [...strokes.current, ...(cur.current ? [cur.current] : [])]) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.size * (c.width / 300);
      ctx.beginPath();
      for (let i = 0; i < s.pts.length; i += 2) { const x = s.pts[i] * c.width, y = s.pts[i + 1] * c.height; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      if (s.pts.length === 2) ctx.lineTo(s.pts[0] * c.width + 0.1, s.pts[1] * c.height);
      ctx.stroke();
    }
  };

  // New round: clear the pad, fetch the word if I'm drawing, restart the clock.
  useEffect(() => {
    strokes.current = []; cur.current = null; redraw();
    setWord(''); setGuess(''); setLeft(DRAW_SECONDS);
    if (g.drawer === myId && g.status === 'live') void act('draw_word', { gameId: g.id }, { quiet: true }).then((w) => typeof w === 'string' && setWord(w));
  }, [roundKey]);

  useEffect(() => {
    if (g.status !== 'live') return;
    const t = setInterval(() => setLeft((x) => {
      if (x <= 1) { if (g.drawer === myId) void act('draw_skip', { gameId: g.id }).then((r) => { const w = (r as { word?: string })?.word; if (w) toast(`Time! The word was “${w}”.`); }); return DRAW_SECONDS; }
      return x - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [roundKey, g.status]);

  useEffect(() => {
    onStrokes((m: LiveMsg) => {
      if (m.t === 'stroke' && m.game === g.id) { strokes.current.push({ pts: m.pts, color: m.color, size: m.size }); redraw(); }
      if (m.t === 'clear' && m.game === g.id) { strokes.current = []; redraw(); }
    });
    const c = canvasRef.current!;
    const fit = () => { const r = c.getBoundingClientRect(); c.width = Math.round(r.width * Math.min(2, devicePixelRatio)); c.height = c.width; redraw(); };
    fit();
    return () => onStrokes(null);
  }, [g.id]);

  const pos = (e: PointerEvent) => { const r = canvasRef.current!.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  const down = (e: PointerEvent) => { if (!drawing) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); cur.current = { pts: pos(e), color: ink, size: ink === '#FFFDF6' ? 16 : 4 }; redraw(); };
  const move = (e: PointerEvent) => {
    if (!cur.current) return;
    const [x, y] = pos(e);
    const p = cur.current.pts;
    if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 0.006) return;
    p.push(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
    redraw();
    // Long strokes are sent in pieces so the guesser sees them appear as they're drawn.
    if (p.length >= 40) { backend.send({ t: 'stroke', game: g.id, ...cur.current }); strokes.current.push(cur.current); cur.current = { pts: [x, y], color: cur.current.color, size: cur.current.size }; }
  };
  const up = () => { if (!cur.current) return; backend.send({ t: 'stroke', game: g.id, ...cur.current }); strokes.current.push(cur.current); cur.current = null; redraw(); };

  const submit = async () => {
    if (!guess.trim()) return;
    const r = (await act('draw_guess', { gameId: g.id, guess })) as { right?: boolean; word?: string } | undefined;
    if (r?.right) { sfx('win'); toast(`Yes! “${r.word}”`, 'love'); }
    else if (r) { sfx('error'); toast('Not quite. Keep guessing.'); }
    setGuess('');
  };

  const score = g.scores ? Object.values(g.scores)[0] ?? 0 : 0;
  const them = partner.value?.name ?? 'Partner';
  if (g.status !== 'live') return (
    <div class="col center">
      <div class="code pbox">{score} / {g.round}</div>
      <p>{score >= 3 ? 'You two are in sync. 💛' : score >= 1 ? 'Nice teamwork.' : 'Abstract art is still art.'}</p>
      <button class="btn block" onClick={onAgain}>Play again</button>
    </div>
  );
  return (
    <div class="col">
      <div class="row">
        <span class="chip">Round {g.round}/4</span>
        <span class="chip">Together: {score}</span>
        <div class="grow" />
        <span class="chip">{left}s</span>
      </div>
      <p class="center" style={{ margin: 0 }}>
        {drawing ? <>Draw: <b style={{ fontWeight: 'normal', color: 'var(--accent)', fontSize: '1.2em' }}>{word || '…'}</b></> : <>{them} is drawing · {'_ '.repeat(g.wordLength ?? 0)}</>}
      </p>
      <canvas ref={canvasRef} class="drawpad" onPointerDown={down as never} onPointerMove={move as never} onPointerUp={up} onPointerCancel={up} />
      {drawing ? (
        <div class="row wrap">
          {INKS.map((c) => <button class="swatch" style={{ background: c }} aria-pressed={ink === c} onClick={() => setInk(c)} aria-label="Ink" />)}
          <button class="swatch" style={{ background: '#FFFDF6' }} aria-pressed={ink === '#FFFDF6'} onClick={() => setInk('#FFFDF6')} aria-label="Eraser" title="Eraser" />
          <div class="grow" />
          <button class="btn soft small" onClick={() => { strokes.current = []; redraw(); backend.send({ t: 'clear', game: g.id }); }}>Clear</button>
          <button class="btn ghost small" onClick={async () => { const r = (await act('draw_skip', { gameId: g.id })) as { word?: string } | undefined; if (r?.word) toast(`Skipped “${r.word}”.`); }}>Skip</button>
        </div>
      ) : (
        <div class="row">
          <input class="input grow" value={guess} onInput={(e) => setGuess(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} placeholder="Your guess" autocapitalize="none" />
          <button class="btn" onClick={submit}><Icon name="send" size="s" /></button>
        </div>
      )}
    </div>
  );
}

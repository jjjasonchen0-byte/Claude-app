// The group chat: an original chat app ("Chats"): a left-aligned header, white incoming and violet
// outgoing bubbles with each sender's name in their colour, a composer with a send button, on an
// iPhone (its status bar and keyboard). Drawn at app size (390×844 app px);
// everything is a pure function of the frame.
import React from 'react';
import { interpolate, Easing } from 'remotion';
import { DARK, EASE, FONT, PEOPLE, clamp } from '../theme';

export type Msg = { who: 'sam' | 'priya' | 'leo' | 'you'; text: string; at: number; typing?: number; card?: React.ReactNode };

const STATUS_TIME = '6:31';
/** The chat app's own colours. */
export const CH = {
  bg: DARK ? '#000000' : '#f4f5f9',
  out: 'linear-gradient(160deg, #6a5cff, #4d3ae6)', // your bubbles
  outFlat: '#5644ef',
  inBubble: DARK ? '#1e1e23' : '#ffffff',
  ink: DARK ? '#f2f2f7' : '#15151c',
  soft: DARK ? 'rgba(235,235,245,.6)' : 'rgba(30,30,45,.55)',
  field: DARK ? '#1c1c1f' : '#eef0f5',
  /** the header and the composer */
  bar: DARK ? '#111114' : '#ffffff',
  barLine: DARK ? 'rgba(255,255,255,.08)' : 'rgba(20,20,40,.06)',
  placeholder: DARK ? 'rgba(235,235,245,.36)' : 'rgba(30,30,45,.42)',
  boxLine: DARK ? '#2e2e34' : '#dcdee8',
  icon: DARK ? '#9a9aa6' : '#6b6b7b',
  dots: DARK ? '#8e8e96' : '#9a9aa8',
};

/**
 * The phone's status bar, as on an iPhone with a Dynamic Island: the time in the left ear; signal,
 * wifi and the battery in the right one.
 */
export const StatusBar: React.FC<{ color?: string; time?: string }> = ({ color = DARK ? '#fff' : '#000', time = STATUS_TIME }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 54, fontFamily: FONT, color, zIndex: 20, pointerEvents: 'none' }}>
    <span style={{ position: 'absolute', left: 0, width: 128, top: 17, textAlign: 'center', fontWeight: 600, fontSize: 16.5, letterSpacing: '-0.02em', lineHeight: '22px' }}>{time}</span>
    <span style={{ position: 'absolute', left: 262, width: 128, top: 22, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      {/* signal: four bars */}
      <svg width="18" height="12" viewBox="0 0 18 12" fill={color}>
        <rect x="0" y="7.6" width="3.2" height="4.4" rx="1" /><rect x="4.8" y="5.2" width="3.2" height="6.8" rx="1" />
        <rect x="9.6" y="2.6" width="3.2" height="9.4" rx="1" /><rect x="14.4" y="0" width="3.2" height="12" rx="1" />
      </svg>
      {/* wifi: three bands fanning out from a point */}
      <svg width="16" height="12" viewBox="0 0 16 12" fill={color}>
        <path d="M8 12L5.6 9.3a3.4 3.4 0 0 1 4.8 0z" />
        <path d="M3.9 7.4a5.9 5.9 0 0 1 8.2 0l-1.1 1.2a4.3 4.3 0 0 0-6 0z" />
        <path d="M1.4 4.8a9.4 9.4 0 0 1 13.2 0l-1.1 1.2a7.8 7.8 0 0 0-11 0z" />
      </svg>
      {/* battery: 82% */}
      <svg width="27" height="13" viewBox="0 0 27 13">
        <rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke={color} strokeOpacity=".38" />
        <rect x="2.2" y="2.2" width={19.6 * 0.82} height="8.6" rx="2" fill={color} />
        <path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1z" fill={color} fillOpacity=".4" />
      </svg>
    </span>
  </div>
);

const Avatar: React.FC<{ who: keyof typeof PEOPLE; size: number; ring?: boolean }> = ({ who, size, ring }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', background: `linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 60%), ${PEOPLE[who].color}`,
    color: '#fff', fontWeight: 700, fontSize: size * 0.44, display: 'grid', placeItems: 'center', flex: 'none',
    boxShadow: ring ? `0 0 0 2px ${CH.bar}` : undefined,
  }}>{PEOPLE[who].initial}</div>
);

// ---------------------------------------------------------------- the keyboard

/** An iPhone-style keyboard: a predictive bar, four rows of keys, the emoji and dictation keys under them. */
export const KB_H = 336;
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KW = 33, KG = 6, KH = 42, ROW_H = 54, TOP = 52;
/** The keyboard's colours, light or dark as the phone is. */
const KB = DARK
  ? { bg: '#2a2a2d', key: '#5d5d62', special: '#3b3b3f', ink: '#fff', icon: '#c7c7cc', line: 'rgba(255,255,255,.16)', shadow: '0 1px 0 rgba(0,0,0,.6)', bar: '#fff' }
  : { bg: '#d2d4da', key: '#ffffff', special: '#abb0ba', ink: '#000', icon: '#50555e', line: 'rgba(0,0,0,.14)', shadow: '0 1px 0 rgba(0,0,0,.3)', bar: '#000' };
/** Where a key sits (its centre, keyboard px). */
const keyAt = (ch: string): { x: number; y: number; w: number } | null => {
  if (ch === ' ') return { x: 195, y: TOP + 3 * ROW_H + KH / 2, w: 198 };
  // (no apostrophe on the letters: the typist writes "Ive" and autocorrect makes it "I've")
  for (let r = 0; r < 3; r++) {
    const i = ROWS[r].indexOf(ch.toLowerCase());
    if (i < 0) continue;
    const n = ROWS[r].length;
    const x0 = (390 - (n * KW + (n - 1) * KG)) / 2;
    return { x: x0 + i * (KW + KG) + KW / 2, y: TOP + r * ROW_H + KH / 2, w: KW };
  }
  return null;
};
/** A key's centre on the screen (app px) with the keyboard up. */
export const keyPoint = (ch: string) => { const k = keyAt(ch); return k ? { x: k.x, y: 844 - KB_H + k.y } : null; };

/** The balloon a pressed letter key grows above itself, with the letter in it, larger. */
const Callout: React.FC<{ x: number; y: number; ch: string; o: number }> = ({ x, y, ch, o }) => {
  const kx = x - KW / 2, ky = y - KH / 2; // the key's top-left
  const bw = KW + 24, bh = 56; // the balloon
  const bx = Math.max(1, Math.min(390 - bw - 1, x - bw / 2)), by = ky - bh + 6;
  const r = 10;
  // the outline: balloon top, down its sides, curving in to the key's sides, round the key's foot
  const d = `M${bx + r},${by} H${bx + bw - r} Q${bx + bw},${by} ${bx + bw},${by + r} V${by + bh - 18}
    C${bx + bw},${by + bh - 6} ${kx + KW},${ky + 4} ${kx + KW},${ky + 16} V${ky + KH - 5} Q${kx + KW},${ky + KH} ${kx + KW - 5},${ky + KH}
    H${kx + 5} Q${kx},${ky + KH} ${kx},${ky + KH - 5} V${ky + 16} C${kx},${ky + 4} ${bx},${by + bh - 6} ${bx},${by + bh - 18} V${by + r} Q${bx},${by} ${bx + r},${by} Z`;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, zIndex: 3 }}>
      <svg width="390" height={KB_H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.28)) drop-shadow(0 4px 10px rgba(0,0,0,.12))' }}>
        <path d={d} fill={KB.key} />
      </svg>
      <div style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh - 12, display: 'grid', placeItems: 'center', fontSize: 34, fontWeight: 400, color: KB.ink }}>{ch}</div>
    </div>
  );
};

export const Keyboard: React.FC<{ frame: number; text: string; from: number; rate: number; sentAt?: number; suggestions?: (typed: string) => string[] }> = ({ frame, text, from, rate, sentAt = 1e9, suggestions }) => {
  // the key being pressed now (each held ~2.5 frames, its letter popping up above it)
  const idx = Math.floor((frame - from) / rate);
  const since = frame - (from + idx * rate);
  const ch = idx >= 0 && idx < text.length ? text[idx] : null;
  const down = ch !== null && since < 2.6 ? keyAt(ch) : null;
  const typed = frame >= sentAt ? '' : text.slice(0, Math.max(0, Math.min(text.length, idx + 1)));
  const words = suggestions?.(typed) ?? [];
  // shift is on for the first letter (the keys show capitals), off after it
  const shiftOn = typed.length === 0 || (ch !== null && idx === 0 && since < 2.6);
  const caps = shiftOn && typed.length === 0;
  const key = (label: React.ReactNode, x: number, y: number, w: number, special = false, pressed = false, k?: string, size = 22.5) => (
    <div key={k ?? String(label) + x} style={{
      position: 'absolute', left: x - w / 2, top: y - KH / 2, width: w, height: KH, borderRadius: 5.5,
      background: special ? (pressed ? KB.key : KB.special) : pressed ? KB.special : KB.key,
      boxShadow: KB.shadow, display: 'grid', placeItems: 'center',
      fontSize: size, fontWeight: 400, color: KB.ink, letterSpacing: 0,
    }}>{label}</div>
  );
  return (
    <div style={{ position: 'absolute', left: 0, bottom: 0, width: 390, height: KB_H, background: KB.bg, fontFamily: FONT }}>
      {/* the predictive bar: three words, thin lines between them */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 45, display: 'flex', alignItems: 'center', fontSize: 16.5, color: KB.ink, letterSpacing: '-0.01em' }}>
        {[0, 1, 2].map((i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ width: 1, height: 24, background: KB.line }} />}
            <span style={{ flex: 1, textAlign: 'center' }}>{words[i] ?? ''}</span>
          </React.Fragment>
        ))}
      </div>
      {ROWS.map((row, r) => row.split('').map((c) => {
        const p = keyAt(c)!;
        return key(caps ? c.toUpperCase() : c, p.x, p.y, KW, false, !!down && down.x === p.x && down.y === p.y, c);
      }))}
      {/* shift and delete */}
      {key(<svg width="20" height="19" viewBox="0 0 24 23" fill={shiftOn ? KB.ink : 'none'} stroke={KB.ink} strokeWidth="1.7" strokeLinejoin="round"><path d="M12 2.5l9 9.5h-5v8.5H8V12H3z" /></svg>, 3 + 21, TOP + 2 * ROW_H + KH / 2, 42, !shiftOn, false, 'shift')}
      {key(<svg width="24" height="18" viewBox="0 0 27 19" fill="none" stroke={KB.ink} strokeWidth="1.6" strokeLinejoin="round"><path d="M8.5 1.5h15a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-15L1.5 9.5z" /><path d="M12.5 6l7 7M19.5 6l-7 7" strokeLinecap="round" /></svg>, 390 - 3 - 21, TOP + 2 * ROW_H + KH / 2, 42, true, false, 'del')}
      {/* bottom row: 123 · space · return */}
      {key('123', 3 + 43.5, TOP + 3 * ROW_H + KH / 2, 87, true, false, 'num', 16.5)}
      {key('space', 195, TOP + 3 * ROW_H + KH / 2, 198, false, !!down && ch === ' ', 'space', 16.5)}
      {key('return', 390 - 3 - 43.5, TOP + 3 * ROW_H + KH / 2, 87, true, false, 'ret', 16.5)}
      {/* under the keys: emoji and dictation */}
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke={KB.icon} strokeWidth="1.7" style={{ position: 'absolute', left: 28 - 14, top: 286 - 14 }}>
        <circle cx="14" cy="14" r="11" /><circle cx="10.2" cy="11.5" r="1.2" fill={KB.icon} stroke="none" /><circle cx="17.8" cy="11.5" r="1.2" fill={KB.icon} stroke="none" /><path d="M8.8 16.2a6 6 0 0 0 10.4 0" strokeLinecap="round" />
      </svg>
      <svg width="26" height="28" viewBox="0 0 26 28" fill="none" stroke={KB.icon} strokeWidth="1.7" strokeLinecap="round" style={{ position: 'absolute', left: 362 - 13, top: 286 - 14 }}>
        <rect x="9" y="3" width="8" height="14" rx="4" fill={KB.icon} stroke="none" /><path d="M5.5 13a7.5 7.5 0 0 0 15 0M13 20.5V25" />
      </svg>
      {/* the letter in its balloon over the key under the thumb */}
      {down && ch !== null && ch !== ' ' && <Callout x={down.x} y={down.y} ch={idx === 0 ? ch.toUpperCase() : ch} o={interpolate(since, [2.1, 2.6], [1, 0], clamp)} />}
      {/* the home indicator */}
      <div style={{ position: 'absolute', bottom: 8, left: 195 - 67, width: 134, height: 5, borderRadius: 3, background: KB.bar }} />
    </div>
  );
};

/**
 * What the predictive bar offers while "I've got just the thing" is typed: what's been typed so far
 * of the word (in quotes when it isn't a word yet), then the likeliest words.
 */
const NEXT: Record<string, string[]> = { '': ['I', 'The', 'I’m'], "I've": ['got', 'been', 'never'], got: ['a', 'just', 'it'], just: ['the', 'a', 'like'], the: ['thing', 'place', 'best'] };
const WORDS = ['I', 'I’m', "I've", 'got', 'gotta', 'going', 'good', 'just', 'jump', 'justice', 'the', 'they', 'then', 'to', 'that', 'thing', 'things', 'think', 'this'];
const suggest = (t: string): string[] => {
  if (!t || t.endsWith(' ')) return NEXT[t.trim().split(' ').pop() || ''] ?? ['the', 'a', 'it'];
  const last = t.split(' ').pop() || '';
  const done = WORDS.filter((w) => w.toLowerCase().startsWith(last.toLowerCase()) && w !== last);
  const pick = last === 'th' && t.includes('the ') ? ['thing', 'the'] : last === 'thi' || last === 'thin' ? ['thing', 'think'] : done.slice(0, 2);
  return [WORDS.includes(last) ? last : `“${last}”`, ...pick];
};

// ---------------------------------------------------------------- the chat

/** A bubble arriving: grows from its tail corner on the app's own spring, ~14f. */
const pop = (frame: number, at: number) => interpolate(frame, [at, at + 14], [0, 1], { ...clamp, easing: EASE.spring });

const TypingDots: React.FC<{ frame: number; from: number; to: number }> = ({ frame, from, to }) => {
  // (stays a couple of frames into the bubble's arrival, so the two overlap: no blank frame)
  if (to <= from) return null;
  const t = interpolate(frame, [from, Math.min(from + 8, from + (to - from) * 0.6), to, to + 3], [0, 1, 1, 0], clamp);
  if (t <= 0) return null;
  return (
    <div style={{ display: 'inline-flex', gap: 5, padding: '13px 15px', borderRadius: 20, borderTopLeftRadius: 6, background: CH.inBubble, boxShadow: '0 1px 2px rgba(20,20,40,.08)', opacity: t, transform: `scale(${0.7 + 0.3 * t})`, transformOrigin: 'left top' }}>
      {[0, 1, 2].map((i) => (
        <i key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: CH.dots, opacity: 0.45 + 0.55 * Math.max(0, Math.sin((frame - from) * 0.32 - i * 0.9)) }} />
      ))}
    </div>
  );
};

/** Where the message field and the send button are (app px), with the keyboard down / up. */
export const FIELD_AT = { x: 160, y: 787 };
export const SEND_UP = { x: 356, y: 844 - KB_H - 31 };

/**
 * The chat. `msgs` arrive at their frames (incoming ones after typing dots from `typing`); `draft`
 * is what's being typed in the field (at `draftFrom`, `draftRate` frames a letter) until `sentAt`,
 * when it flies up as your bubble. The keyboard slides up from `fieldTapAt`.
 */
export const ChatScreen: React.FC<{
  frame: number; msgs: Msg[]; draft?: string; draftFrom?: number; draftRate?: number; sentAt?: number; fieldTapAt?: number; extra?: React.ReactNode; time?: string;
}> = ({ frame, msgs, draft = '', draftFrom = 1e9, draftRate = 1.8, sentAt = 1e9, fieldTapAt = 1e9, extra, time }) => {
  const typed = frame < draftFrom ? 0 : Math.min(draft.length, Math.floor((frame - draftFrom) / draftRate) + 1);
  const field = frame >= sentAt ? '' : draft.slice(0, typed);
  const focused = frame >= fieldTapAt;
  const caretOn = Math.floor(frame / 8) % 2 === 0 || (frame >= draftFrom && frame < draftFrom + draft.length * draftRate);
  // the keyboard slides up when the field is tapped (and stays), ~8 frames
  const kb = interpolate(frame, [fieldTapAt, fieldTapAt + 8], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  let prev: Msg['who'] | null = null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: CH.bg, fontFamily: FONT, overflow: 'hidden' }}>
      <StatusBar time={time} />
      {/* header: back, the group, its name, more */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 118, background: CH.bar, boxShadow: `0 1px 0 ${CH.barLine}, 0 4px 14px rgba(20,20,40,.04)`, zIndex: 10 }}>
        <div style={{ position: 'absolute', left: 10, right: 14, top: 58, height: 52, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={CH.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
          {/* the group's picture: its three members, overlapping */}
          <div style={{ position: 'relative', width: 44, height: 44 }}>
            <div style={{ position: 'absolute', left: 0, top: 0 }}><Avatar who="sam" size={26} ring /></div>
            <div style={{ position: 'absolute', left: 18, top: 4 }}><Avatar who="priya" size={26} ring /></div>
            <div style={{ position: 'absolute', left: 8, top: 18 }}><Avatar who="leo" size={26} ring /></div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: CH.ink, letterSpacing: '-0.01em' }}>The Crew</div>
            <div style={{ fontSize: 12.5, color: CH.soft, marginTop: 1 }}>Sam, Priya, Leo</div>
          </div>
          <svg width="24" height="24" viewBox="0 0 24 24" fill={CH.ink}><circle cx="12" cy="5.5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="18.5" r="1.8" /></svg>
        </div>
      </div>
      {/* messages */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 130, padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msgs.map((m, i) => {
          const showName = m.who !== 'you' && prev !== m.who;
          prev = m.who;
          const shown = frame >= m.at;
          const p = pop(frame, m.at);
          if (m.who === 'you') {
            if (!shown) return null;
            // your bubble: flies up from the field
            const fly = interpolate(frame, [m.at, m.at + 12], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', transform: `translateY(${fly * (300 - 220 * kb)}px)`, opacity: interpolate(frame, [m.at, m.at + 3], [0, 1], clamp) }}>
                {m.card ? m.card : null}
                {!m.card && <div style={{ background: CH.out, color: '#fff', padding: '10px 15px', borderRadius: 20, borderTopRightRadius: 6, fontSize: 17, lineHeight: 1.25, letterSpacing: '-0.01em', maxWidth: 270, boxShadow: '0 2px 6px rgba(77,58,230,.25)' }}>{m.text}</div>}
              </div>
            );
          }
          const typingFrom = m.typing ?? m.at - 14;
          if (frame < typingFrom) return null;
          return (
            <div key={i}>
              {showName && <div style={{ fontSize: 12, fontWeight: 700, color: PEOPLE[m.who].color, margin: '0 0 3px 46px', opacity: interpolate(frame, [typingFrom, typingFrom + 6], [0, 1], clamp) }}>{PEOPLE[m.who].name}</div>}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ opacity: interpolate(frame, [typingFrom, typingFrom + 6], [0, 1], clamp) }}><Avatar who={m.who} size={30} /></div>
                <div style={{ position: 'relative' }}>
                  <TypingDots frame={frame} from={typingFrom} to={m.at} />
                  {shown && (
                    <div style={{ position: frame < m.at + 3 ? 'absolute' : 'relative', left: 0, top: 0 }}>
                      {m.card ? <div style={{ transform: `scale(${0.4 + 0.6 * p})`, transformOrigin: 'left top', opacity: Math.min(1, 0.5 + p * 3) }}>{m.card}</div> :
                      <div style={{
                        background: CH.inBubble, color: CH.ink, padding: '10px 15px', borderRadius: 20, borderTopLeftRadius: 6, fontSize: 17, lineHeight: 1.25, letterSpacing: '-0.01em',
                        boxShadow: '0 1px 2px rgba(20,20,40,.08)', transform: `scale(${0.4 + 0.6 * p})`, transformOrigin: 'left top', opacity: Math.min(1, 0.5 + p * 3), maxWidth: 260, whiteSpace: 'nowrap',
                      }}>{m.text}</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {extra}
      {/* the keyboard */}
      {kb > 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: KB_H, transform: `translateY(${(1 - kb) * KB_H}px)`, zIndex: 11 }}><Keyboard frame={frame} text={draft} from={draftFrom} rate={draftRate} sentAt={sentAt} suggestions={suggest} /></div>}
      {/* compose: a plain + (attach), a bordered box to write in, a square send button */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: kb * KB_H, padding: `8px 12px ${34 - 26 * kb}px`, display: 'flex', gap: 10, alignItems: 'center', background: CH.bar, boxShadow: `0 -1px 0 ${CH.barLine}`, zIndex: 10 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={CH.icon} strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        <div style={{ flex: 1, height: 42, borderRadius: 12, background: CH.bar, border: `1.5px solid ${CH.boxLine}`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 17, color: field ? CH.ink : CH.placeholder, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {field || 'Write to The Crew…'}
          {focused && caretOn && <span style={{ width: 2, height: 21, background: CH.outFlat, marginLeft: 1, borderRadius: 1 }} />}
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: CH.out, opacity: field ? 1 : 0.45, display: 'grid', placeItems: 'center', transform: `scale(${interpolate(frame, [sentAt - 2, sentAt, sentAt + 4], [1, 0.86, 1], clamp)})` }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M9 6h9v9" /></svg>
        </div>
      </div>
      {/* home indicator */}
      {kb === 0 && <div style={{ position: 'absolute', bottom: 8, left: 195 - 67, width: 134, height: 5, borderRadius: 3, background: DARK ? '#fff' : '#000', zIndex: 12 }} />}
    </div>
  );
};

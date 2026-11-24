// The group chat: an original chat app in Meet's design language (a non-replica scene; SPEC Q1).
// Drawn at app size (390×844 app px); everything is a pure function of the frame.
import React from 'react';
import { interpolate, Easing } from 'remotion';
import { C, EASE, FONT, PEOPLE, clamp } from '../theme';

export type Msg = { who: 'sam' | 'priya' | 'leo' | 'you'; text: string; at: number; typing?: number; card?: React.ReactNode };

const STATUS_TIME = '6:30';

export const StatusBar: React.FC<{ color?: string; time?: string }> = ({ color = '#000', time = STATUS_TIME }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 30px 6px 34px', fontFamily: FONT, color, zIndex: 20 }}>
    <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>{time}</span>
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {/* signal */}
      <svg width="18" height="12" viewBox="0 0 18 12" fill={color}><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
      {/* wifi */}
      <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M1.5 4.3a9.5 9.5 0 0 1 13 0M4 7a6 6 0 0 1 8 0" /><circle cx="8" cy="10" r="1.2" fill={color} stroke="none" /></svg>
      {/* battery */}
      <svg width="26" height="12" viewBox="0 0 26 12"><rect x="0.6" y="0.6" width="22" height="10.8" rx="3" fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="1.2" /><rect x="2.2" y="2.2" width="16" height="7.6" rx="1.8" fill={color} /><rect x="23.6" y="4" width="1.8" height="4" rx="0.9" fill={color} fillOpacity="0.45" /></svg>
    </span>
  </div>
);

const Avatar: React.FC<{ who: keyof typeof PEOPLE; size: number; ring?: boolean }> = ({ who, size, ring }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', background: `linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 60%), ${PEOPLE[who].color}`,
    color: '#fff', fontWeight: 700, fontSize: size * 0.44, display: 'grid', placeItems: 'center', flex: 'none',
    boxShadow: ring ? '0 0 0 2px #fff' : undefined,
  }}>{PEOPLE[who].initial}</div>
);


// ---------------------------------------------------------------- the keyboard

/** A plain on-screen keyboard (lowercase keys, a suggestion strip), 300 app px tall with its foot. */
export const KB_H = 300;
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KW = 33, KG = 6, KH = 42, ROW_H = 54, TOP = 44;
/** Where a key sits (its centre, keyboard px). */
const keyAt = (ch: string): { x: number; y: number; w: number } | null => {
  if (ch === ' ') return { x: 195, y: TOP + 3 * ROW_H + KH / 2 + 4, w: 186 };
  for (let r = 0; r < 3; r++) {
    const i = ROWS[r].indexOf(ch.toLowerCase());
    if (i < 0) continue;
    const n = ROWS[r].length;
    const x0 = (390 - (n * KW + (n - 1) * KG)) / 2;
    return { x: x0 + i * (KW + KG) + KW / 2, y: TOP + r * ROW_H + KH / 2 + 4, w: KW };
  }
  return null;
};

export const Keyboard: React.FC<{ frame: number; text: string; from: number; rate: number; suggestions?: (typed: string) => string[] }> = ({ frame, text, from, rate, suggestions }) => {
  // the key being pressed now (each held ~3 frames, its letter popping up above it)
  const idx = Math.floor((frame - from) / rate);
  const since = frame - (from + idx * rate);
  const ch = idx >= 0 && idx < text.length ? text[idx] : null;
  const down = ch !== null && since < 3.2 ? keyAt(ch) : null;
  const typed = text.slice(0, Math.max(0, Math.min(text.length, idx + 1)));
  const words = suggestions?.(typed) ?? [];
  const shiftOn = typed.length === 0;
  const key = (label: React.ReactNode, x: number, y: number, w: number, special = false, pressed = false, k?: string) => (
    <div key={k ?? String(label) + x} style={{
      position: 'absolute', left: x - w / 2, top: y - KH / 2, width: w, height: KH, borderRadius: 6,
      background: pressed ? (special ? '#9aa0ab' : '#c8ccd3') : special ? '#b4b9c3' : '#fff',
      boxShadow: '0 1px 0 rgba(0,0,0,.28)', display: 'grid', placeItems: 'center',
      fontSize: 22, fontWeight: 400, color: '#111', letterSpacing: 0,
    }}>{label}</div>
  );
  return (
    <div style={{ position: 'absolute', left: 0, bottom: 0, width: 390, height: KB_H, background: '#d3d5db', fontFamily: FONT }}>
      {/* suggestions */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: TOP, display: 'flex', alignItems: 'center', justifyContent: 'space-around', fontSize: 16, color: '#222' }}>
        {[0, 1, 2].map((i) => (
          <React.Fragment key={i}>
            <span style={{ width: 110, textAlign: 'center', fontWeight: i === 1 ? 600 : 400 }}>{words[i] ?? ''}</span>
            {i < 2 && <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,.14)' }} />}
          </React.Fragment>
        ))}
      </div>
      {ROWS.map((row, r) => row.split('').map((c) => {
        const p = keyAt(c)!;
        return key(c, p.x, p.y, KW, false, !!down && down.x === p.x && down.y === p.y, c);
      }))}
      {/* shift and delete */}
      {key(<svg width="20" height="20" viewBox="0 0 24 24" fill={shiftOn ? '#111' : 'none'} stroke="#111" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 4l8 8.5h-4.5V20h-7v-7.5H4z" /></svg>, 3 + 21, TOP + 2 * ROW_H + KH / 2 + 4, 42, !shiftOn, false, 'shift')}
      {key(<svg width="24" height="18" viewBox="0 0 26 18" fill="none" stroke="#111" strokeWidth="1.7" strokeLinejoin="round"><path d="M8 2h15a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 23 16H8l-6.5-7z" /><path d="M12 6l6 6M18 6l-6 6" strokeLinecap="round" /></svg>, 390 - 3 - 21, TOP + 2 * ROW_H + KH / 2 + 4, 42, true, false, 'del')}
      {/* bottom row */}
      {key(<span style={{ fontSize: 16 }}>123</span>, 3 + 24, TOP + 3 * ROW_H + KH / 2 + 4, 48, true, false, 'num')}
      {key(<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1" fill="#111" /><circle cx="15" cy="10" r="1" fill="#111" /><path d="M8 14.5c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2" strokeLinecap="round" /></svg>, 3 + 48 + 6 + 22, TOP + 3 * ROW_H + KH / 2 + 4, 44, true, false, 'emoji')}
      {key('', 195 + 14, TOP + 3 * ROW_H + KH / 2 + 4, 186, false, !!down && ch === ' ', 'space')}
      {key(<svg width="22" height="18" viewBox="0 0 24 20" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 3v6a3 3 0 0 1-3 3H4M8 7l-4 5 4 5" /></svg>, 390 - 3 - 41, TOP + 3 * ROW_H + KH / 2 + 4, 82, true, false, 'ret')}
      {/* the letter popping up over the key under the finger */}
      {down && ch !== ' ' && (
        <div style={{
          position: 'absolute', left: down.x - 26, top: down.y - KH / 2 - 62, width: 52, height: 60, borderRadius: 10, background: '#fff',
          boxShadow: '0 4px 14px rgba(0,0,0,.22), 0 0 0 .5px rgba(0,0,0,.12)', display: 'grid', placeItems: 'center', fontSize: 32, color: '#111',
          opacity: interpolate(since, [0, 0.6, 2.6, 3.2], [0.4, 1, 1, 0], clamp),
        }}>{ch}</div>
      )}
      {/* the home indicator */}
      <div style={{ position: 'absolute', bottom: 8, left: 195 - 67, width: 134, height: 5, borderRadius: 3, background: '#000' }} />
    </div>
  );
};

/** What the strip suggests while "I've got just the thing" is typed. */
const suggest = (t: string): string[] => {
  const last = t.split(' ').pop() || '';
  if (!t) return ['I', 'Hey', 'Yes'];
  if (t.endsWith(' ')) return t.trim().endsWith('got') ? ['a', 'just', 'it'] : t.trim().endsWith('just') ? ['the', 'a', 'got'] : t.trim().endsWith('the') ? ['thing', 'place', 'spot'] : ['got', 'have', 'been'];
  if ('thing'.startsWith(last) && t.includes('the ')) return ['"' + last + '"', 'thing', 'things'];
  if ('just'.startsWith(last)) return ['"' + last + '"', 'just', 'jus'];
  if ('got'.startsWith(last)) return ['"' + last + '"', 'got', 'gotta'];
  return ['"' + last + '"', last.replace(/^i/, 'I'), last + 's'];
};

/** A bubble arriving: grows from its tail corner on the app's own spring, ~14f. */
const pop = (frame: number, at: number) => interpolate(frame, [at, at + 14], [0, 1], { ...clamp, easing: EASE.spring });

const TypingDots: React.FC<{ frame: number; from: number; to: number }> = ({ frame, from, to }) => {
  const t = interpolate(frame, [from, from + 8, to - 3, to], [0, 1, 1, 0], clamp);
  if (t <= 0) return null;
  return (
    <div style={{ display: 'inline-flex', gap: 5, padding: '12px 15px', borderRadius: 20, background: C.bubbleIn, opacity: t, transform: `scale(${0.7 + 0.3 * t})`, transformOrigin: 'left bottom' }}>
      {[0, 1, 2].map((i) => (
        <i key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#8e8e96', opacity: 0.45 + 0.55 * Math.max(0, Math.sin((frame - from) * 0.32 - i * 0.9)) }} />
      ))}
    </div>
  );
};

/**
 * The chat. `msgs` arrive at their frames (incoming ones after typing dots from `typing`); `draft`
 * is what's being typed in the field (at `draftFrom`, `draftRate` frames a letter) until `sentAt`,
 * when it flies up as your blue bubble.
 */
export const ChatScreen: React.FC<{
  frame: number; msgs: Msg[]; draft?: string; draftFrom?: number; draftRate?: number; sentAt?: number; fieldTapAt?: number; extra?: React.ReactNode;
}> = ({ frame, msgs, draft = '', draftFrom = 1e9, draftRate = 1.8, sentAt = 1e9, fieldTapAt = 1e9, extra }) => {
  const typed = frame < draftFrom ? 0 : Math.min(draft.length, Math.floor((frame - draftFrom) / draftRate) + 1);
  const field = frame >= sentAt ? '' : draft.slice(0, typed);
  const focused = frame >= fieldTapAt && frame < sentAt + 6;
  const caretOn = Math.floor(frame / 8) % 2 === 0 || (frame >= draftFrom && frame < draftFrom + draft.length * draftRate);
  // the keyboard slides up when the field is tapped (and stays)
  const kb = interpolate(frame, [fieldTapAt, fieldTapAt + 10], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.9, 0.25, 1) });
  let prev: Msg['who'] | null = null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fff', fontFamily: FONT, overflow: 'hidden' }}>
      <StatusBar />
      {/* header */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 50, height: 104, background: 'rgba(248,248,252,0.94)', borderBottom: `0.5px solid ${C.sep}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 6, zIndex: 10 }}>
        <svg style={{ position: 'absolute', left: 16, top: 26 }} width="12" height="20" viewBox="0 0 12 20" fill="none" stroke={C.accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2L2 10l8 8" /></svg>
        <div style={{ display: 'flex' }}>
          {(['sam', 'priya', 'leo'] as const).map((w, i) => <div key={w} style={{ marginLeft: i ? -9 : 0 }}><Avatar who={w} size={34} ring /></div>)}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>The Crew</div>
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: -2 }}>Sam, Priya, Leo</div>
      </div>
      {/* messages */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 166, padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                {!m.card && <div style={{ background: `linear-gradient(180deg, #2b8fff, ${C.accent})`, color: '#fff', padding: '9px 14px', borderRadius: 20, borderBottomRightRadius: 6, fontSize: 17, lineHeight: 1.25, letterSpacing: '-0.01em', maxWidth: 270 }}>{m.text}</div>}
              </div>
            );
          }
          const typingFrom = m.typing ?? m.at - 14;
          if (frame < typingFrom) return null;
          return (
            <div key={i}>
              {showName && <div style={{ fontSize: 11.5, color: C.inkSoft, margin: '0 0 3px 50px', opacity: interpolate(frame, [typingFrom, typingFrom + 6], [0, 1], clamp) }}>{PEOPLE[m.who].name}</div>}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ opacity: interpolate(frame, [typingFrom, typingFrom + 6], [0, 1], clamp) }}><Avatar who={m.who} size={28} /></div>
                {!shown ? <TypingDots frame={frame} from={typingFrom} to={m.at} /> : (
                  m.card ? <div style={{ transform: `scale(${0.4 + 0.6 * p})`, transformOrigin: 'left bottom', opacity: Math.min(1, p * 3) }}>{m.card}</div> :
                  <div style={{
                    background: C.bubbleIn, color: '#000', padding: '9px 14px', borderRadius: 20, borderBottomLeftRadius: 6, fontSize: 17, lineHeight: 1.25, letterSpacing: '-0.01em',
                    transform: `scale(${0.4 + 0.6 * p})`, transformOrigin: 'left bottom', opacity: Math.min(1, p * 3), maxWidth: 260,
                  }}>{m.text}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {extra}
      {/* compose */}
      {kb > 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: KB_H, transform: `translateY(${(1 - kb) * KB_H}px)`, zIndex: 11 }}><Keyboard frame={frame} text={draft} from={draftFrom} rate={draftRate} suggestions={suggest} /></div>}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: kb * KB_H, padding: `9px 12px ${34 - 25 * kb}px`, display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(248,248,252,0.96)', borderTop: `0.5px solid ${C.sep}`, zIndex: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.fill, display: 'grid', placeItems: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" stroke="#8e8e93" strokeWidth="2.2" strokeLinecap="round"><path d="M8 2v12M2 8h12" /></svg>
        </div>
        <div style={{ flex: 1, minHeight: 36, borderRadius: 18, border: `1px solid ${focused ? 'rgba(0,122,255,.45)' : 'rgba(60,60,67,.2)'}`, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 17, color: field ? '#000' : 'rgba(60,60,67,.45)', letterSpacing: '-0.01em' }}>
          {field || (focused ? '' : 'Message')}
          {focused && caretOn && <span style={{ width: 2, height: 21, background: C.accent, marginLeft: 1, borderRadius: 1 }} />}
        </div>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: field ? C.accent : '#c7c7cc', display: 'grid', placeItems: 'center', transform: `scale(${interpolate(frame, [sentAt - 2, sentAt, sentAt + 4], [1, 0.84, 1], clamp)})` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </div>
      </div>
      {/* home indicator */}
      {kb === 0 && <div style={{ position: 'absolute', bottom: 8, left: 195 - 67, width: 134, height: 5, borderRadius: 3, background: '#000', zIndex: 12 }} />}
    </div>
  );
};

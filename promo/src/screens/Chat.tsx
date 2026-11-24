// The group chat: an original chat app ("Chats"), not modelled on any phone maker's own: a left-aligned
// header, white incoming and violet outgoing bubbles with each sender's name in their colour, a pill
// composer with a round send button, and a plain keyboard. Drawn at app size (390×844 app px);
// everything is a pure function of the frame.
import React from 'react';
import { interpolate, Easing } from 'remotion';
import { EASE, FONT, PEOPLE, clamp } from '../theme';

export type Msg = { who: 'sam' | 'priya' | 'leo' | 'you'; text: string; at: number; typing?: number; card?: React.ReactNode };

const STATUS_TIME = '6:30';
/** The chat app's own colours. */
export const CH = {
  bg: '#f4f5f9',
  out: 'linear-gradient(160deg, #6a5cff, #4d3ae6)', // your bubbles
  outFlat: '#5644ef',
  inBubble: '#ffffff',
  ink: '#15151c',
  soft: 'rgba(30,30,45,.55)',
  field: '#eef0f5',
};

export const StatusBar: React.FC<{ color?: string; time?: string }> = ({ color = '#000', time = STATUS_TIME }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 30px 8px 34px', fontFamily: FONT, color, zIndex: 20 }}>
    <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>{time}</span>
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {/* wifi */}
      <svg width="16" height="12" viewBox="0 0 16 12" fill={color}><path d="M8 11.5L.6 3.4a10.6 10.6 0 0 1 14.8 0z" opacity=".95" /></svg>
      {/* signal */}
      <svg width="14" height="12" viewBox="0 0 14 12" fill={color}><path d="M13.5 .5v11H2.5z" /></svg>
      {/* battery (upright, with its level) */}
      <svg width="12" height="16" viewBox="0 0 12 16"><rect x="2" y="2" width="8" height="13.4" rx="1.6" fill="none" stroke={color} strokeWidth="1.2" /><rect x="4" y="0.4" width="4" height="1.8" rx=".6" fill={color} /><rect x="3.4" y="5" width="5.2" height="9" rx=".8" fill={color} /></svg>
      <span style={{ fontWeight: 600, fontSize: 13 }}>82%</span>
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

/** A plain on-screen keyboard (flat rounded keys, a suggestion strip), 300 app px tall with its foot. */
export const KB_H = 300;
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KW = 33, KG = 6, KH = 44, ROW_H = 54, TOP = 42;
/** Where a key sits (its centre, keyboard px). */
const keyAt = (ch: string): { x: number; y: number; w: number } | null => {
  if (ch === ' ') return { x: 195, y: TOP + 3 * ROW_H + KH / 2 + 2, w: 170 };
  if (ch === "'") return { x: 390 - 3 - 18 - 36 - 6, y: TOP + 3 * ROW_H + KH / 2 + 2, w: 36 }; // (on the '.' key's long press)
  for (let r = 0; r < 3; r++) {
    const i = ROWS[r].indexOf(ch.toLowerCase());
    if (i < 0) continue;
    const n = ROWS[r].length;
    const x0 = (390 - (n * KW + (n - 1) * KG)) / 2;
    return { x: x0 + i * (KW + KG) + KW / 2, y: TOP + r * ROW_H + KH / 2 + 2, w: KW };
  }
  return null;
};
/** A key's centre on the screen (app px) with the keyboard up. */
export const keyPoint = (ch: string) => { const k = keyAt(ch); return k ? { x: k.x, y: 844 - KB_H + k.y } : null; };

export const Keyboard: React.FC<{ frame: number; text: string; from: number; rate: number; sentAt?: number; suggestions?: (typed: string) => string[] }> = ({ frame, text, from, rate, sentAt = 1e9, suggestions }) => {
  // the key being pressed now (each held ~2.5 frames, its letter popping up above it)
  const idx = Math.floor((frame - from) / rate);
  const since = frame - (from + idx * rate);
  const ch = idx >= 0 && idx < text.length ? text[idx] : null;
  const down = ch !== null && since < 2.6 ? keyAt(ch) : null;
  const typed = frame >= sentAt ? '' : text.slice(0, Math.max(0, Math.min(text.length, idx + 1)));
  const words = suggestions?.(typed) ?? [];
  const shiftOn = typed.length === 0;
  const key = (label: React.ReactNode, x: number, y: number, w: number, special = false, pressed = false, k?: string, accent = false) => (
    <div key={k ?? String(label) + x} style={{
      position: 'absolute', left: x - w / 2, top: y - KH / 2, width: w, height: KH, borderRadius: accent ? KH / 2 : 9,
      background: accent ? (pressed ? '#3f2ed0' : CH.outFlat) : pressed ? (special ? '#b9bfcc' : '#dfe2ea') : special ? '#d3d8e2' : '#fff',
      boxShadow: '0 0 0 .5px rgba(20,20,40,.06)', display: 'grid', placeItems: 'center',
      fontSize: 21, fontWeight: 400, color: accent ? '#fff' : '#1b1b22', letterSpacing: 0,
    }}>{label}</div>
  );
  return (
    <div style={{ position: 'absolute', left: 0, bottom: 0, width: 390, height: KB_H, background: '#e7e9ef', fontFamily: FONT }}>
      {/* suggestions: plain words, the likeliest in the middle */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: TOP, display: 'flex', alignItems: 'center', justifyContent: 'space-around', fontSize: 16, color: '#2a2a33' }}>
        {[0, 1, 2].map((i) => (
          <React.Fragment key={i}>
            <span style={{ width: 110, textAlign: 'center', fontWeight: i === 1 ? 600 : 400 }}>{words[i] ?? ''}</span>
            {i < 2 && <span style={{ width: 1, height: 18, background: 'rgba(0,0,0,.12)' }} />}
          </React.Fragment>
        ))}
      </div>
      {ROWS.map((row, r) => row.split('').map((c) => {
        const p = keyAt(c)!;
        return key(c, p.x, p.y, KW, false, !!down && down.x === p.x && down.y === p.y, c);
      }))}
      {/* shift and delete */}
      {key(<svg width="18" height="18" viewBox="0 0 24 24" fill={shiftOn ? '#1b1b22' : 'none'} stroke="#1b1b22" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 4l8 8.5h-4.5V20h-7v-7.5H4z" /></svg>, 3 + 21, TOP + 2 * ROW_H + KH / 2 + 2, 42, !shiftOn, false, 'shift')}
      {key(<svg width="22" height="16" viewBox="0 0 26 18" fill="none" stroke="#1b1b22" strokeWidth="1.7" strokeLinejoin="round"><path d="M8 2h15a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 23 16H8l-6.5-7z" /><path d="M12 6l6 6M18 6l-6 6" strokeLinecap="round" /></svg>, 390 - 3 - 21, TOP + 2 * ROW_H + KH / 2 + 2, 42, true, false, 'del')}
      {/* bottom row: ?123 · , · emoji · space · . · enter */}
      {key(<span style={{ fontSize: 14, fontWeight: 500 }}>?123</span>, 3 + 24, TOP + 3 * ROW_H + KH / 2 + 2, 48, true, false, 'num')}
      {key(',', 3 + 48 + 6 + 17, TOP + 3 * ROW_H + KH / 2 + 2, 34, true, false, 'comma')}
      {key(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1b1b22" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1" fill="#1b1b22" /><circle cx="15" cy="10" r="1" fill="#1b1b22" /><path d="M8 14.5c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2" strokeLinecap="round" /></svg>, 3 + 48 + 6 + 34 + 6 + 17, TOP + 3 * ROW_H + KH / 2 + 2, 34, true, false, 'emoji')}
      {key('', 3 + 48 + 6 + 34 + 6 + 34 + 6 + 66, TOP + 3 * ROW_H + KH / 2 + 2, 132, false, !!down && ch === ' ', 'space')}
      {key('.', 390 - 3 - 44 - 6 - 18, TOP + 3 * ROW_H + KH / 2 + 2, 36, true, !!down && ch === "'", 'dot')}
      {key(<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 5v7H6M10 8l-4 4 4 4" /></svg>, 390 - 3 - 22, TOP + 3 * ROW_H + KH / 2 + 2, 44, true, false, 'ret', true)}
      {/* the letter popping up over the key under the finger */}
      {down && ch !== ' ' && (
        <div style={{
          position: 'absolute', left: down.x - 24, top: down.y - KH / 2 - 56, width: 48, height: 50, borderRadius: 12, background: '#fff',
          boxShadow: '0 6px 16px rgba(20,20,40,.2), 0 0 0 .5px rgba(20,20,40,.1)', display: 'grid', placeItems: 'center', fontSize: 28, color: '#1b1b22',
          opacity: interpolate(since, [0, 0.5, 2.1, 2.6], [0.5, 1, 1, 0], clamp),
        }}>{ch}</div>
      )}
      {/* the home indicator */}
      <div style={{ position: 'absolute', bottom: 8, left: 195 - 60, width: 120, height: 4.5, borderRadius: 3, background: '#1b1b22' }} />
    </div>
  );
};

/** What the strip suggests while "I've got just the thing" is typed. */
const suggest = (t: string): string[] => {
  const last = t.split(' ').pop() || '';
  if (!t) return ['I', 'Hey', 'Yes'];
  if (t.endsWith(' ')) return t.trim().endsWith('got') ? ['a', 'just', 'it'] : t.trim().endsWith('just') ? ['a', 'the', 'got'] : t.trim().endsWith('the') ? ['place', 'thing', 'spot'] : ['have', 'got', 'been'];
  if ('thing'.startsWith(last) && t.includes('the ')) return ['think', 'thing', 'things'];
  if ('just'.startsWith(last)) return ['jus', 'just', 'judt'];
  if ('got'.startsWith(last)) return ['go', 'got', 'gotta'];
  return [last.toLowerCase(), last.replace(/^i/, 'I'), last + 's'];
};

// ---------------------------------------------------------------- the chat

/** A bubble arriving: grows from its tail corner on the app's own spring, ~14f. */
const pop = (frame: number, at: number) => interpolate(frame, [at, at + 14], [0, 1], { ...clamp, easing: EASE.spring });

const TypingDots: React.FC<{ frame: number; from: number; to: number }> = ({ frame, from, to }) => {
  // (stays a couple of frames into the bubble's arrival, so the two overlap: no blank frame)
  const t = interpolate(frame, [from, from + 8, to, to + 3], [0, 1, 1, 0], clamp);
  if (t <= 0) return null;
  return (
    <div style={{ display: 'inline-flex', gap: 5, padding: '13px 15px', borderRadius: 20, borderTopLeftRadius: 6, background: CH.inBubble, boxShadow: '0 1px 2px rgba(20,20,40,.08)', opacity: t, transform: `scale(${0.7 + 0.3 * t})`, transformOrigin: 'left top' }}>
      {[0, 1, 2].map((i) => (
        <i key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#9a9aa8', opacity: 0.45 + 0.55 * Math.max(0, Math.sin((frame - from) * 0.32 - i * 0.9)) }} />
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
      {/* header: back, the group, its name, call buttons */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 118, background: '#fff', boxShadow: '0 1px 0 rgba(20,20,40,.06), 0 4px 14px rgba(20,20,40,.04)', zIndex: 10 }}>
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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={CH.ink} strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="6.5" width="12.5" height="11" rx="2.5" /><path d="M15.5 10.5l5-3v9l-5-3z" /></svg>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CH.ink} strokeWidth="1.8" strokeLinejoin="round" style={{ marginLeft: 8 }}><path d="M6.5 3.5l3 .4 1.2 4.3-2.1 1.5a12 12 0 0 0 5.7 5.7l1.5-2.1 4.3 1.2.4 3a1.8 1.8 0 0 1-1.8 1.9A16.8 16.8 0 0 1 4.6 5.3a1.8 1.8 0 0 1 1.9-1.8z" /></svg>
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
      {/* compose: a pill field (emoji · text · attach, camera) and a round button: the mic, or send once there's text */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: kb * KB_H, padding: `8px 10px ${34 - 26 * kb}px`, display: 'flex', gap: 8, alignItems: 'center', background: '#fff', boxShadow: '0 -1px 0 rgba(20,20,40,.06)', zIndex: 10 }}>
        <div style={{ flex: 1, height: 44, borderRadius: 22, background: CH.field, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', fontSize: 17, color: field ? CH.ink : 'rgba(30,30,45,.45)', letterSpacing: '-0.01em' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b8b99" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1" fill="#8b8b99" /><circle cx="15" cy="10" r="1" fill="#8b8b99" /><path d="M8 14.5c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2" strokeLinecap="round" /></svg>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {field || 'Message'}
            {focused && caretOn && <span style={{ width: 2, height: 21, background: CH.outFlat, marginLeft: 1, borderRadius: 1 }} />}
          </span>
          {!field && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b8b99" strokeWidth="1.7" strokeLinecap="round"><path d="M16.5 7.5l-7.8 7.8a2 2 0 0 0 2.8 2.8l8-8a4 4 0 0 0-5.7-5.7l-8 8a6 6 0 0 0 8.5 8.5l6-6" /></svg>}
          {!field && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b8b99" strokeWidth="1.7" strokeLinejoin="round"><rect x="3" y="7" width="18" height="12" rx="3" /><circle cx="12" cy="13" r="3.2" /><path d="M8.5 7l1.4-2.2h4.2L15.5 7" /></svg>}
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: CH.out, display: 'grid', placeItems: 'center', boxShadow: '0 2px 6px rgba(77,58,230,.3)', transform: `scale(${interpolate(frame, [sentAt - 2, sentAt, sentAt + 4], [1, 0.86, 1], clamp)})` }}>
          {field
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M3.4 20.4l17.4-7.5a1 1 0 0 0 0-1.8L3.4 3.6a.8.8 0 0 0-1.1.9L4 11l9 1-9 1-1.7 6.5a.8.8 0 0 0 1.1.9z" /></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="#fff" stroke="none" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>}
        </div>
      </div>
      {/* home indicator */}
      {kb === 0 && <div style={{ position: 'absolute', bottom: 8, left: 195 - 60, width: 120, height: 4.5, borderRadius: 3, background: '#1b1b22', zIndex: 12 }} />}
    </div>
  );
};

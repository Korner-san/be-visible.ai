import React, { useState, useEffect, useRef } from 'react';

// ── Typing speed (ms per character) ─────────────────────────────────────────
const TYPING_SPEED = 15;

// ── TypingAnimation ──────────────────────────────────────────────────────────
interface TypingAnimationProps {
  children: string;
  delay?: number;
  className?: string;
  typingSpeed?: number;
}

export const TypingAnimation: React.FC<TypingAnimationProps> = ({
  children,
  delay = 0,
  className,
  typingSpeed = TYPING_SPEED,
}) => {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(children.slice(0, i));
      if (i >= children.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, typingSpeed);
    return () => clearInterval(interval);
  }, [started, children, typingSpeed]);

  return (
    <div className={`flex items-start ${className ?? ''}`}>
      <span>{displayed}</span>
      {!done && started && (
        <span
          className="ml-0.5 inline-block w-[2px] h-[1em] bg-current align-middle"
          style={{ animation: 'blink 1s step-start infinite' }}
        />
      )}
    </div>
  );
};

// ── AnimatedSpan ─────────────────────────────────────────────────────────────
interface AnimatedSpanProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export const AnimatedSpan: React.FC<AnimatedSpanProps> = ({
  children,
  delay = 0,
  className,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className={className ?? ''}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(4px)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
      }}
    >
      {children}
    </div>
  );
};

// ── Terminal ─────────────────────────────────────────────────────────────────
interface TerminalProps {
  children: React.ReactNode;
  className?: string;
}

export const Terminal: React.FC<TerminalProps> = ({ children, className }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as content appears
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new MutationObserver(() => {
      el.scrollTop = el.scrollHeight;
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Blink keyframe — injected once globally */}
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
      <div
        ref={ref}
        className={`bg-[#0d1117] rounded-xl font-mono text-sm leading-6 overflow-y-auto ${className ?? ''}`}
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#30363d transparent' }}
      >
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[10px] text-[#484f58] font-sans font-semibold tracking-wider uppercase">
            BeVisible Agent Terminal
          </span>
        </div>
        <div className="px-5 py-4 space-y-1">
          {children}
        </div>
      </div>
    </>
  );
};

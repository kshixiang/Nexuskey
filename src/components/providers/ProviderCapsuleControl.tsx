import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProviderCapsuleControlProps {
  /** true：已开启（黄底）；false：未开启（灰底） */
  active: boolean;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  className?: string;
}

export function ProviderCapsuleControl({
  active,
  label,
  icon: Icon,
  disabled,
  onClick,
  className,
}: ProviderCapsuleControlProps) {
  const interactive = !disabled && Boolean(onClick);

  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const [slideX, setSlideX] = useState(0);

  const updateSlide = useCallback(() => {
    const track = trackRef.current;
    const pill = pillRef.current;
    if (!track || !pill) return;
    const pad = 4;
    const max = Math.max(0, track.clientWidth - pill.offsetWidth - pad);
    setSlideX(max);
  }, []);

  useLayoutEffect(() => {
    updateSlide();
  }, [updateSlide, active, label]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const pill = pillRef.current;
    if (!track || !pill) return;
    const ro = new ResizeObserver(() => updateSlide());
    ro.observe(track);
    ro.observe(pill);
    return () => ro.disconnect();
  }, [updateSlide]);

  const shellClass = cn(
    "inline-flex w-auto shrink-0 items-center gap-2 rounded-full py-1",
    active ? "pl-1 pr-3" : "pl-3 pr-1",
    "transition-[background-color,transform] duration-200 ease-out",
    active
      ? "bg-[#f5c518]"
      : "bg-[#d4d4d8]",
    interactive &&
      active &&
      "cursor-pointer hover:bg-[#e6b800] active:scale-[0.97] active:bg-[#e6b800]",
    interactive &&
      !active &&
      "cursor-pointer hover:bg-[#c4c4cc] active:scale-[0.97] active:bg-[#c4c4cc]",
    !interactive && "cursor-default",
    disabled &&
      "pointer-events-none cursor-not-allowed opacity-50",
    className,
  );

  const arrowsClass = cn(
    "shrink-0 select-none text-[18px] font-bold leading-none tracking-[-3px]",
    active ? "text-[#b8860b]" : "text-[#71717a]",
  );

  const pillStyle = {
    transform: `translate(${active ? slideX : 0}px, -50%)`,
    top: "50%",
    left: 0,
  } satisfies CSSProperties;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={shellClass}
      aria-pressed={active}
    >
      {!active ? (
        <span className={arrowsClass} aria-hidden>
          ‹‹‹
        </span>
      ) : null}
      <div
        ref={trackRef}
        className="relative h-[38px] w-[132px] shrink-0 sm:w-[140px]"
      >
        <span
          ref={pillRef}
          className={cn(
            "absolute inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-medium text-[#1a1a1a]",
            "transition-transform duration-300 ease-out will-change-transform",
          )}
          style={pillStyle}
        >
          <Icon className="size-4 shrink-0 text-[#1a1a1a]" strokeWidth={2} aria-hidden />
          <span>{label}</span>
        </span>
      </div>
      {active ? (
        <span className={arrowsClass} aria-hidden>
          ›››
        </span>
      ) : null}
    </button>
  );
}

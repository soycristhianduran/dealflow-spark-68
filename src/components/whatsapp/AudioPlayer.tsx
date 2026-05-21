import { useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Custom audio player styled to match WhatsApp bubbles.
 * Shows play/pause, click-to-seek progress bar, current/total time.
 */
export function AudioPlayer({ src, outgoing }: { src: string; outgoing: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      setLoading(true);
      try { await a.play(); } catch (_) { /* ignored */ }
      setLoading(false);
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 my-1 w-[220px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
      />

      <button
        onClick={toggle}
        className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors",
          outgoing ? "bg-green-700/30 hover:bg-green-700/50" : "bg-primary/15 hover:bg-primary/25",
        )}
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : playing
            ? <Pause className="h-4 w-4" />
            : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>

      <div className="flex-1 space-y-1">
        <div
          className="relative h-1.5 rounded-full bg-gray-300/60 cursor-pointer overflow-hidden"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            const t = ratio * (duration || 0);
            if (audioRef.current) { audioRef.current.currentTime = t; setCurrentTime(t); }
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-primary/70 rounded-full transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 leading-none">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Music2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import musicSrc from "@/assets/audio/tokyo-drift.mp3?url";

/** Bundled via Vite so deploy always includes the file. */
const MUSIC_SRC = musicSrc;
const MUSIC_SETTING_KEY = "tristate_bg_music_enabled";

function apiBase(): string {
  const env = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  return env || "";
}

/** Fail-open: music on unless API explicitly disables it. */
async function fetchMusicEnabled(): Promise<boolean> {
  const bases = [apiBase(), ""].filter((b, i, a) => a.indexOf(b) === i);
  for (const base of bases) {
    const prefix = base ? `${base}/api` : "/api";
    for (const path of ["/site/config", "/checkout/config"]) {
      try {
        const res = await fetch(`${prefix}${path}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const data = (await res.json()) as { backgroundMusicEnabled?: boolean };
        if (typeof data.backgroundMusicEnabled === "boolean") {
          return data.backgroundMusicEnabled;
        }
      } catch {
        /* try next */
      }
    }
  }
  return true;
}

/**
 * Site-wide background loop. On by default; admin can disable via settings API.
 * Skipped on /admin. Shows tap-to-play if the browser blocks autoplay.
 */
export function BackgroundMusic() {
  const location = useLocation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const unlockedRef = useRef(false);
  const [enabled, setEnabled] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  // The nudge is a one-time offer. Without this it re-armed on every failed
  // autoplay retry -- and a retry fires on every tap and keypress -- so it
  // blinked in and out of the corner for the whole visit.
  const [nudgeSpent, setNudgeSpent] = useState(false);
  const isAdmin = location.pathname.startsWith("/admin");

  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;

    const load = async () => {
      const on = await fetchMusicEnabled();
      if (!cancelled) {
        setEnabled(on);
        try {
          localStorage.setItem(MUSIC_SETTING_KEY, on ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
    };

    try {
      const cached = localStorage.getItem(MUSIC_SETTING_KEY);
      if (cached === "0") setEnabled(false);
    } catch {
      /* ignore */
    }

    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [isAdmin]);

  const tryPlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !enabled || isAdmin) return false;
    try {
      if (audio.readyState < 2) audio.load();
      await audio.play();
      setPlaying(true);
      setNeedsTap(false);
      unlockedRef.current = true;
      return true;
    } catch {
      setPlaying(false);
      setNeedsTap(true);
      return false;
    }
  }, [enabled, isAdmin]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isAdmin) return;

    audio.volume = 0.3;
    audio.loop = true;

    const onPlaying = () => {
      setPlaying(true);
      setNeedsTap(false);
    };
    const onPause = () => setPlaying(false);

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);

    if (!enabled) {
      pause();
      return () => {
        audio.removeEventListener("playing", onPlaying);
        audio.removeEventListener("pause", onPause);
      };
    }

    const onCanPlay = () => {
      if (!unlockedRef.current) tryPlay();
    };
    audio.addEventListener("canplay", onCanPlay);
    tryPlay();

    const unlock = () => {
      if (!enabled) return;
      tryPlay();
    };
    document.addEventListener("pointerdown", unlock, { capture: true });
    document.addEventListener("keydown", unlock, { capture: true });
    document.addEventListener("touchstart", unlock, { capture: true, passive: true });

    return () => {
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      document.removeEventListener("pointerdown", unlock, { capture: true });
      document.removeEventListener("keydown", unlock, { capture: true });
      document.removeEventListener("touchstart", unlock, { capture: true });
    };
  }, [enabled, isAdmin, tryPlay, pause]);

  // An offer to press something is only useful briefly. Left up it becomes
  // furniture, and it sits over the page on a phone where there is no room
  // to spare.
  useEffect(() => {
    if (!needsTap || nudgeSpent) return;
    const t = setTimeout(() => setNudgeSpent(true), 6000);
    return () => clearTimeout(t);
  }, [needsTap, nudgeSpent]);

  const toggle = async () => {
    // Whichever way this goes, the user has now made the choice the nudge was
    // asking for.
    setNudgeSpent(true);
    if (playing) {
      pause();
      setEnabled(false);
      try {
        localStorage.setItem(MUSIC_SETTING_KEY, "0");
      } catch {
        /* ignore */
      }
    } else {
      setEnabled(true);
      try {
        localStorage.setItem(MUSIC_SETTING_KEY, "1");
      } catch {
        /* ignore */
      }
      await tryPlay();
    }
  };

  if (isAdmin) return null;

  return (
    <>
      <audio ref={audioRef} src={MUSIC_SRC} preload="auto" aria-hidden tabIndex={-1} playsInline />
      {/* Always mounted. This used to render only while the music was on or
          wanted, so muting removed the control itself and there was no way
          back. A toggle that disappears when you use it is not a toggle. */}
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex flex-col items-end gap-2">
          {needsTap && !playing && !nudgeSpent ? (
            <Button
              type="button"
              size="sm"
              onClick={() => tryPlay()}
              className="shadow-lg gap-2 bg-primary/90 backdrop-blur-sm animate-pulse"
            >
              <Music2 className="h-4 w-4" />
              Tap for music
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={toggle}
            className="h-11 w-11 sm:h-9 sm:w-9 rounded-full shadow-md bg-background/80 backdrop-blur-sm border border-border/60"
            aria-label={playing ? "Mute background music" : "Play background music"}
          >
            {playing ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
      </div>
    </>
  );
}

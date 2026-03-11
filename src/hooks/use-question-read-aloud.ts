"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function toErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "This browser blocked audio autoplay. Tap Read aloud to start the voice manually.";
  }

  if (error instanceof Error && error.message) {
    const message = error.message.trim();
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("notallowederror") ||
      lowerMessage.includes("not allowed by the user agent") ||
      lowerMessage.includes("user denied permission")
    ) {
      return "This browser blocked audio autoplay. Tap Read aloud to start the voice manually.";
    }

    return error.message;
  }
  return "Read aloud is unavailable right now.";
}

export type ReadAloudSegment = {
  id: string;
  url: string;
  body: Record<string, unknown>;
  audioUrl?: string;
};

type UseQuestionReadAloudParams = {
  segments: ReadonlyArray<ReadAloudSegment>;
  playbackKey: string | null;
  autoPlayEnabled: boolean;
  onSegmentEnd?: (segmentId: string) => void;
};

function mediaErrorMessage(audio: HTMLAudioElement): string {
  const mediaError = audio.error;
  if (!mediaError) {
    return "Could not play narration audio.";
  }

  switch (mediaError.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Narration playback was interrupted.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "Narration audio could not be loaded from the network.";
    case MediaError.MEDIA_ERR_DECODE:
      return "This device could not decode the narration audio.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "This device does not support the narration audio source.";
    default:
      return "Could not play narration audio.";
  }
}

export function useQuestionReadAloud(params: UseQuestionReadAloudParams) {
  const { segments, playbackKey, autoPlayEnabled, onSegmentEnd } = params;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const autoPlayedKeyRef = useRef<string | null>(null);
  const playRunIdRef = useRef(0);
  const prefetchedAudioUrlsRef = useRef<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teardownAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    playRunIdRef.current += 1;
    teardownAudio();
    setIsLoading(false);
    setIsPlaying(false);
    setActiveSegmentId(null);
  }, [teardownAudio]);

  const play = useCallback(async () => {
    if (!playbackKey || segments.length === 0) {
      return;
    }

    const runId = playRunIdRef.current + 1;
    playRunIdRef.current = runId;
    teardownAudio();
    setError(null);
    setIsLoading(true);
    setIsPlaying(false);
    setActiveSegmentId(null);

    try {
      for (const segment of segments) {
        if (runId !== playRunIdRef.current) {
          return;
        }

        setActiveSegmentId(segment.id);
        setIsPlaying(false);

        const audioUrl = segment.audioUrl;
        const hasPrefetchedAudio = audioUrl
          ? prefetchedAudioUrlsRef.current.has(audioUrl)
          : false;
        setIsLoading(!hasPrefetchedAudio);

        let audio: HTMLAudioElement;

        if (audioUrl) {
          teardownAudio();
          audio = new Audio(audioUrl);
        } else {
          const response = await fetch(segment.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(segment.body),
          });

          if (!response.ok) {
            const raw = await response.text();
            let message = `Failed to load narration audio (HTTP ${response.status})`;

            try {
              const payload = raw ? (JSON.parse(raw) as { error?: string }) : {};
              if (payload.error) {
                message = payload.error;
              } else if (raw && !raw.startsWith("<!DOCTYPE")) {
                message = raw.slice(0, 180);
              }
            } catch {
              if (raw && !raw.startsWith("<!DOCTYPE")) {
                message = raw.slice(0, 180);
              }
            }

            throw new Error(message);
          }

          const blob = await response.blob();
          if (runId !== playRunIdRef.current) {
            return;
          }

          teardownAudio();
          const objectUrl = URL.createObjectURL(blob);
          objectUrlRef.current = objectUrl;
          audio = new Audio(objectUrl);
        }

        audioRef.current = audio;
        audio.preload = "auto";

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error(mediaErrorMessage(audio)));
          audio
            .play()
            .then(() => {
              if (runId !== playRunIdRef.current) {
                audio.pause();
                audio.currentTime = 0;
                resolve();
                return;
              }
              setIsLoading(false);
              setIsPlaying(true);
            })
            .catch(reject);
        });

        teardownAudio();
        if (runId !== playRunIdRef.current) {
          return;
        }

        setIsPlaying(false);
        setIsLoading(false);
        onSegmentEnd?.(segment.id);
      }

      if (runId === playRunIdRef.current) {
        setActiveSegmentId(null);
      }
    } catch (playError) {
      if (runId !== playRunIdRef.current) {
        return;
      }

      teardownAudio();
      setIsLoading(false);
      setIsPlaying(false);
      setActiveSegmentId(null);
      setError(toErrorMessage(playError));
    }
  }, [onSegmentEnd, playbackKey, segments, teardownAudio]);

  useEffect(() => {
    stop();
    setError(null);
    autoPlayedKeyRef.current = null;
  }, [playbackKey, stop]);

  useEffect(() => {
    if (!playbackKey) {
      return;
    }

    const controller = new AbortController();

    for (const segment of segments) {
      const audioUrl = segment.audioUrl;
      if (!audioUrl || prefetchedAudioUrlsRef.current.has(audioUrl)) {
        continue;
      }

      void fetch(audioUrl, {
        method: "GET",
        cache: "force-cache",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            return;
          }

          await response.blob();
          prefetchedAudioUrlsRef.current.add(audioUrl);
        })
        .catch(() => {
          // Ignore failed prefetches and fall back to loading during playback.
        });
    }

    return () => {
      controller.abort();
    };
  }, [playbackKey, segments]);

  useEffect(() => {
    if (!autoPlayEnabled || !playbackKey || segments.length === 0) {
      return;
    }

    if (autoPlayedKeyRef.current === playbackKey) {
      return;
    }

    autoPlayedKeyRef.current = playbackKey;
    void play();
  }, [autoPlayEnabled, playbackKey, play, segments.length]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    activeSegmentId,
    error,
    isLoading,
    isPlaying,
    play,
    stop,
  };
}

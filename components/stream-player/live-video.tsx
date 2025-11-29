"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { Participant, Track, VideoQuality, RemoteTrackPublication } from "livekit-client";
import { useTracks } from "@livekit/components-react";
import { useEventListener } from "usehooks-ts";

import { VolumeControl } from "./volume-control";
import { FullscreenControl } from "./fullscreen-control";
import { QualityControl } from "./quality-control";

interface LiveVideoProps {
  participant: Participant;
};

export const LiveVideo = ({
  participant,
}: LiveVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(100);
  const [videoQuality, setVideoQuality] = useState("auto");

  // Get video tracks for this participant (supports both camera and OBS/ingress streams)
  const videoTracks = useTracks([Track.Source.Camera, Track.Source.Unknown])
    .filter((track) => track.participant.identity === participant.identity);

  // Get all tracks at top level (required by React hooks rules)
  const allTracks = useTracks([Track.Source.Camera, Track.Source.Microphone]);

  // Memoize filtered tracks to avoid unnecessary filtering on every render
  const participantTracks = useMemo(
    () => allTracks.filter(
      (track) => track.participant.identity === participant.identity
    ),
    [allTracks, participant.identity]
  );

  const onVolumeChange = (value: number) => {
    setVolume(+value);
    if (videoRef?.current) {
      videoRef.current.muted = value === 0;
      videoRef.current.volume = +value * 0.01;
    }
  };

  const toggleMute = () => {
    const isMuted = volume === 0;

    setVolume(isMuted ? 50 : 0);

    if (videoRef?.current) {
      videoRef.current.muted = !isMuted;
      videoRef.current.volume = isMuted ? 0.5 : 0;
    }
  };

  const onQualityChange = (quality: string) => {
    setVideoQuality(quality);

    if (videoTracks.length > 0) {
      const videoPublication = videoTracks[0].publication as RemoteTrackPublication;

      // Map quality string to VideoQuality enum
      let videoQualityEnum: VideoQuality;
      switch (quality) {
        case "1080p":
          videoQualityEnum = VideoQuality.HIGH;
          break;
        case "720p":
          videoQualityEnum = VideoQuality.MEDIUM;
          break;
        case "480p":
        case "360p":
          videoQualityEnum = VideoQuality.LOW;
          break;
        case "auto":
        default:
          // For auto, we don't set a specific quality and let LiveKit handle it
          videoQualityEnum = VideoQuality.HIGH; // Default to high for auto
          break;
      }

      // Set the video quality if not auto
      if (quality !== "auto") {
        videoPublication.setVideoQuality(videoQualityEnum);
      }
    }
  };

  useEffect(() => {
    onVolumeChange(100);
  }, []);

  // Track previous tracks for proper cleanup
  const previousTracksRef = useRef<typeof participantTracks>([]);

  // Attach/detach tracks to video element with proper cleanup
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Detach previous tracks first
    previousTracksRef.current.forEach((track) => {
      track.publication.track?.detach(videoElement);
    });

    // Attach new tracks
    participantTracks.forEach((track) => {
      track.publication.track?.attach(videoElement);
    });

    // Store current tracks for next cleanup
    previousTracksRef.current = participantTracks;

    // Cleanup: detach tracks when component unmounts or participant changes
    return () => {
      participantTracks.forEach((track) => {
        track.publication.track?.detach(videoElement);
      });
    };
  }, [participantTracks]);

  const toggleFullscreen = () => {
    if (isFullscreen) {
      document.exitFullscreen()
    } else if (wrapperRef?.current) {
      wrapperRef.current.requestFullscreen()
    }
  };

  const handleFullscreenChange = () => {
    const isCurrentlyFullscreen = document.fullscreenElement !== null;
    setIsFullscreen(isCurrentlyFullscreen);
  }

  useEventListener("fullscreenchange", handleFullscreenChange, wrapperRef);

  return (
    <div
      ref={wrapperRef}
      className="relative h-full flex"
    >
      <video ref={videoRef} width="100%" />
      <div className="absolute top-0 h-full w-full opacity-0 hover:opacity-100 hover:transition-all">
        <div className="absolute bottom-0 flex h-14 w-full items-center justify-between bg-gradient-to-r from-neutral-900 px-4">
          <VolumeControl
            onChange={onVolumeChange}
            value={volume}
            onToggle={toggleMute}
          />
          <div className="flex items-center gap-4">
            <QualityControl
              onQualityChange={onQualityChange}
              currentQuality={videoQuality}
            />
            <FullscreenControl
              isFullscreen={isFullscreen}
              onToggle={toggleFullscreen}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

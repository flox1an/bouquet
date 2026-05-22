import React, { useState, useRef, useEffect } from 'react';
import { useGlobalContext } from '../GlobalState';
import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

dayjs.extend(duration);

const AudioPlayer: React.FC = () => {
  const { state, dispatch } = useGlobalContext();
  const { currentSong } = state;
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [volumeBeforeMute, setVolumeBeforeMute] = useState(1);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const updateProgress = () => {
        if (audio.duration && !isNaN(audio.currentTime)) {
          setProgress(((audio.currentTime || 0) / audio.duration) * 100);
        }
      };

      const updateProgressFrame = () => {
        updateProgress();
        requestAnimationFrame(updateProgressFrame);
      };

      audio.addEventListener('play', updateProgressFrame);
      audio.addEventListener('pause', updateProgressFrame);
      requestAnimationFrame(updateProgressFrame);

      return () => {
        audio.removeEventListener('play', updateProgressFrame);
        audio.removeEventListener('pause', updateProgressFrame);
      };
    }
  }, [currentSong]);

  useEffect(() => {
    if (audioRef.current && currentSong) {
      audioRef.current.src = currentSong.url;
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [currentSong]);

  const playPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const tuneVolume = (newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const changeVolume = (value: number[]) => {
    tuneVolume(value[0]);
  };

  const resetPlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setProgress(0);
    dispatch({ type: 'RESET_CURRENT_SONG' }); // Assuming this resets the current song in global state
  };

  return (
    currentSong && (
      <div className="flex items-center gap-3 px-4 py-3 w-full">
        <audio ref={audioRef} />

        {/* Track info - left side */}
        {currentSong.id3 && (
          <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
            <img
              className="w-10 h-10 rounded-md shadow-sm"
              src={currentSong.id3.cover}
              alt={currentSong.id3.title}
            />
            <div className="flex flex-col min-w-0 hidden sm:flex">
              <span className="text-sm font-medium truncate">{currentSong.id3.title}</span>
              <span className="text-xs text-muted-foreground truncate">{currentSong.id3.artist}</span>
            </div>
          </div>
        )}

        {/* Playback controls - center */}
        <div className="flex-1 flex flex-col items-center gap-1 max-w-xl mx-auto">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={playPause}>
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-muted-foreground w-10 text-right hidden md:block">
              {dayjs.duration(audioRef.current?.currentTime || 0, 'seconds').format('m:ss')}
            </span>
            <Slider
              value={[progress]}
              max={100}
              step={0.1}
              onValueChange={(value) => {
                if (audioRef.current) {
                  audioRef.current.currentTime = (value[0] / 100) * audioRef.current.duration;
                }
              }}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-10 hidden md:block">
              {audioRef.current?.duration
                ? dayjs.duration(audioRef.current.duration, 'seconds').format('m:ss')
                : '--:--'}
            </span>
          </div>
        </div>

        {/* Volume & close - right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="items-center gap-1 hidden md:flex">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                if (volume === 0) {
                  tuneVolume(volumeBeforeMute);
                } else {
                  setVolumeBeforeMute(volume);
                  tuneVolume(0);
                }
              }}
            >
              {volume === 0 ? (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Volume2 className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>

            <Slider
              value={[volume]}
              max={1}
              step={0.01}
              onValueChange={changeVolume}
              className="w-24"
            />
          </div>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetPlayer}>
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    )
  );
};

export default AudioPlayer;

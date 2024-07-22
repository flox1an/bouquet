import React, { useState, useRef, useEffect } from 'react';
import { useGlobalContext } from '../GlobalState';
import { PauseIcon, PlayIcon, SpeakerWaveIcon, SpeakerXMarkIcon, XMarkIcon } from '@heroicons/react/24/solid';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

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

  const changeVolume = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(event.target.value);
    tuneVolume(newVolume);
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
      <div className="audio-player flex items-center md:gap-4 gap-2 w-full">
        <audio ref={audioRef} />
        <button className="btn btn-icon" onClick={playPause}>
          {isPlaying ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
        </button>

        <span className="w-10 hidden md:block">
          {dayjs.duration(audioRef.current?.currentTime || 0, 'seconds').format('m:ss')}
        </span>
        <div className="flex-grow w-60 hidden md:block">
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={e => {
              if (audioRef.current) {
                audioRef.current.currentTime = (parseInt(e.target.value) / 100) * audioRef.current.duration;
              }
            }}
            className="progress progress-primary w-full cursor-pointer"
          />
        </div>

        <div className="items-center md:space-x-2 hidden md:flex">
          {volume === 0 ? (
            <SpeakerXMarkIcon
              className="h-6 w-6 text-gray-500"
              onClick={() => {
                tuneVolume(volumeBeforeMute);
              }}
            />
          ) : (
            <SpeakerWaveIcon
              className="h-6 w-6 text-gray-500"
              onClick={() => {
                setVolumeBeforeMute(volume);
                tuneVolume(0);
              }}
            />
          )}

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={changeVolume}
            className="progress progress-primary cursor-pointer hidden md:block"
          />
        </div>

        {currentSong.id3 && (
          <>
            <div>
              <img className="w-12 h-12" src={currentSong.id3.cover} alt={currentSong.id3.title} />
            </div>
            <div className="flex flex-col text-sm">
              <div className="text-accent">{currentSong.id3.title}</div>
              <div>{currentSong.id3.artist}</div>
            </div>
          </>
        )}

        <button className="btn btn-icon ml-auto" onClick={resetPlayer}>
          <XMarkIcon className="h-6 w-6 text-gray-500" />
        </button>
      </div>
    )
  );
};

export default AudioPlayer;

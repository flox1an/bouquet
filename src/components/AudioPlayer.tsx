import React, { useState, useRef, useEffect } from 'react';

import { useGlobalContext } from '../GlobalState';
import { PauseIcon, PlayIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline';

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

const AudioPlayer: React.FC = () => {
  const { state } = useGlobalContext();
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
      audio.addEventListener('timeupdate', updateProgress);
      return () => {
        audio.removeEventListener('timeupdate', updateProgress);
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

  return (
    currentSong && (
      <div className="audio-player flex items-center space-x-4">
        <audio ref={audioRef} />
        {/*currentSong && <span className="font-semibold">{currentSong}</span>
         */}
        <button className="btn  btn-icon" onClick={playPause}>
          {isPlaying ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
        </button>

        <span className="w-10 hidden md:block">
          {' '}
          {dayjs.duration(audioRef.current?.currentTime || 0, 'seconds').format('m:ss')}
        </span>
        <div className="flex-grow w-60 hidden md:block cursor-pointer">
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={e =>
              audioRef.current &&
              (audioRef.current.currentTime = (parseInt(e.target.value) / 100) * audioRef.current.duration)
            }
            className="progress progress-primary w-full"
          />
        </div>

        <div className="flex items-center space-x-2 cursor-pointer">
          {volume == 0 ? (
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
            className="progress progress-primary"
          />
        </div>
        {currentSong.id3 && (
          <>
            <div>
              <img className="w-12 h-12" src={currentSong.id3?.cover}></img>
            </div>
            <div className="flex flex-col text-sm">
              <div className="text-white">{currentSong?.id3.title}</div>
              <div>{currentSong?.id3.artist}</div>
            </div>
          </>
        )}
      </div>
    )
  );
};

export default AudioPlayer;

import React, { createContext, useReducer, useContext, ReactNode } from 'react';
import { ID3Tag } from './utils/id3';

type Song = {
  url: string;
  id3?: ID3Tag;
};

interface State {
  currentSong?: Song;
}

const initialState: State = {
  currentSong: undefined,
};

type Action =
  | { type: 'SET_CURRENT_SONG'; song: Song }
  | { type: 'RESET_CURRENT_SONG' };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_CURRENT_SONG':
      return { ...state, currentSong: action.song };
    case 'RESET_CURRENT_SONG':
      return { ...state, currentSong: undefined };
    default:
      return state;
  }
};

const GlobalContext = createContext<{ state: State; dispatch: React.Dispatch<Action> } | undefined>(undefined);

interface GlobalProviderProps {
  children: ReactNode;
}

const GlobalProvider: React.FC<GlobalProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  return <GlobalContext.Provider value={{ state, dispatch }}>{children}</GlobalContext.Provider>;
};

const useGlobalContext = () => {
  const context = useContext(GlobalContext);
  if (context === undefined) {
    throw new Error('useGlobalContext must be used within a GlobalProvider');
  }
  return context;
};

export { GlobalProvider, useGlobalContext };

"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { socket } from "@/socket";

type GameState = {
  nickname: string;
  players: Record<string, number>;
  isRegistered: boolean;
};

type GameContextType = {
  state: GameState;
  setNickname: (nickname: string) => void;
  setPlayers: (players: Record<string, number>) => void;
};

const initialState: GameState = {
  nickname: "",
  players: {},
  isRegistered: false
};

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<GameState>(initialState);

  useEffect(() => {
    // Load state from localStorage on mount
    const storedNickname = localStorage.getItem("nickname");
    const storedCountryCode = localStorage.getItem("countryCode");
    
    if (storedNickname) {
      setState(prev => ({ ...prev, nickname: storedNickname }));
      // Re-register with the server
      socket.emit("register nickname", storedNickname);
    }
    
    if (storedCountryCode) {
      setState(prev => ({ ...prev, countryCode: storedCountryCode }));
    }

    // Set up socket event listeners
    const handleNicknameAccepted = () => {
      setState(prev => ({ ...prev, isRegistered: true }));
    };
    
    const handleUserCounts = (data: Record<string, number>) => {
      setState(prev => ({ ...prev, players: data }));
    };

    socket.on("nickname accepted", handleNicknameAccepted);
    socket.on("user counts", handleUserCounts);

    return () => {
      socket.off("nickname accepted", handleNicknameAccepted);
      socket.off("user counts", handleUserCounts);
    };
  }, []);

  const setNickname = (newNickname: string) => {
    setState(prev => ({ ...prev, nickname: newNickname }));
    localStorage.setItem("nickname", newNickname);
    socket.emit("register nickname", newNickname);
  };

  const setPlayers = (players: Record<string, number>) => {
    setState(prev => ({ ...prev, players }));
  };

  return (
    <GameContext.Provider value={{ 
      state, 
      setNickname,
      setPlayers
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
};
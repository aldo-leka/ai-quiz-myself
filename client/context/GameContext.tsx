"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { socket } from "@/socket";

type GameState = {
  nickname: string
  players: Record<string, number>
  isRegistered: boolean
  gameCode?: string
}

type GameContextType = {
  state: GameState
  setNickname: (nickname: string) => void
  setGameCode: (code: string | undefined) => void
}

const initialState: GameState = {
  nickname: "",
  players: {},
  isRegistered: false,
  gameCode: undefined
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<GameState>(initialState)

  // Effect for socket setup and nickname initialization - runs once
  useEffect(() => {
    const storedNickname = localStorage.getItem("nickname");

    if (storedNickname) {
      setState(prev => ({ ...prev, nickname: storedNickname }));
      // Re-register with the server
      socket.emit("register nickname", storedNickname);
    }

    const handleConnect = () => {
      const nickname = localStorage.getItem("nickname");
      if (nickname) {
        socket.emit("register nickname", nickname);
      }
    }

    // Set up socket event listeners
    const handleNicknameAccepted = () => {
      setState(prev => ({ ...prev, isRegistered: true }));
    }

    socket.on("connect", handleConnect)
    socket.on("nickname accepted", handleNicknameAccepted)

    return () => {
      socket.off("connect", handleConnect)
      socket.off("nickname accepted", handleNicknameAccepted)
    };
  }, [])

  useEffect(() => {
    const getPlayerCountries = async () => {
      const query = state.gameCode ? `?code=${encodeURIComponent(state.gameCode)}` : "";
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/users-by-country${query}`);
      const data = await response.json();
      setPlayers(data);
    };

    getPlayerCountries();

    const intervalId: NodeJS.Timeout = setInterval(getPlayerCountries, 10_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [state.gameCode])

  const setNickname = (newNickname: string) => {
    setState(prev => ({ ...prev, nickname: newNickname }))
    localStorage.setItem("nickname", newNickname)
    socket.emit("register nickname", newNickname)
  }

  const setGameCode = (code: string | undefined) => {
    setState(prev => ({ ...prev, gameCode: code }));
  };

  const setPlayers = (players: Record<string, number>) => {
    setState(prev => ({ ...prev, players }))
  };

  return (
    <GameContext.Provider value={{ 
      state, 
      setNickname,
      setGameCode
    }}>
      {children}
    </GameContext.Provider>
  )
}

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGame must be used within a GameProvider")
  }
  return context
}
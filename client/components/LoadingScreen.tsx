"use client"

import {useEffect, useRef, useState} from "react";
import CircularButton from "@/components/CircularButton";
import confetti from "canvas-confetti";
import {LOADING_ACTIONS} from "@/lib/constants";

export default function LoadingScreen() {
    const [loadingAction, setLoadingAction] = useState("");
    const loadingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [confettiBtnSelected, setConfettiBtnSelected] = useState(false);
    const confettiBtnTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        startLoadingSequence();

        return () => {
            if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
            if (confettiBtnTimeoutRef.current) clearTimeout(confettiBtnTimeoutRef.current);
        };
    }, []);

    function startLoadingSequence() {
        const getRandomAction = () => {
            const randomIndex = Math.floor(Math.random() * LOADING_ACTIONS.length)
            return LOADING_ACTIONS[randomIndex]
        };

        setLoadingAction(getRandomAction());

        loadingIntervalRef.current = setInterval(() => {
            setLoadingAction(getRandomAction());
        }, Math.random() * 2000 + 3000);
    }

    function triggerConfetti() {
        if (confettiBtnTimeoutRef.current)
            clearInterval(confettiBtnTimeoutRef.current);

        setConfettiBtnSelected(true);
        confetti({
            particleCount: 100,
            spread: 70
        });
        confettiBtnTimeoutRef.current = setTimeout(() => {
            if (confettiBtnTimeoutRef.current)
                clearInterval(confettiBtnTimeoutRef.current);
            setConfettiBtnSelected(false);
        }, 500);
    }

    return (
        <div className="min-h-screen grid grid-cols-3 grid-rows-3">
            <div className="col-start-2 row-start-1 flex flex-col items-center justify-end">
                <h2 className=" text-lg sm:text-xl md:text-2xl font-semibold text-center">
                    Loading...
                </h2>
                <div className="text-sm text-center min-h-[60px] flex items-center">
                    {loadingAction}
                </div>
            </div>

            <div className="col-start-2 row-start-2 flex items-center justify-center">
                <CircularButton onClick={triggerConfetti} selected={confettiBtnSelected}>
                    Confetti!
                </CircularButton>
            </div>
        </div>
    )
}
"use client"

import {useEffect, useState, Suspense} from "react";
import {socket} from "@/socket";
import {useGame} from "@/context/GameContext";
import {useRouter, useSearchParams} from "next/navigation";
import Input from "@/components/Input";
import Button from "@/components/Button";
import LoadingScreen from "@/components/LoadingScreen";

function UsernameForm() {
    const {setNickname} = useGame();
    const [inputValue, setInputValue] = useState("")
    const [message, setMessage] = useState("test")
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const handleNicknameUnavailable = () => {
            setMessage("Nickname is already taken");
        };

        const handleNicknameAccepted = () => {
            const returnUrl = searchParams.get('returnUrl') || '/';
            router.push(returnUrl);
        };

        socket.on("nickname unavailable", handleNicknameUnavailable);
        socket.on("nickname accepted", handleNicknameAccepted);

        return () => {
            socket.off("nickname unavailable", handleNicknameUnavailable);
            socket.off("nickname accepted", handleNicknameAccepted);
        };
    }, [router, searchParams]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && inputValue.trim()) {
            setNickname(inputValue);
        }
    };

    return (
        <div
            className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 mx-auto w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl select-none">
            <h2 className="sm:py-4 text-lg sm:text-xl md:text-2xl font-semibold">
                What should others refer you as?
            </h2>
            <Input
                id="nickname"
                type="text"
                placeholder=""
                className="w-full mb-2"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
            />
            <Button
                onClick={() => setNickname(inputValue)}
                disabled={!inputValue.trim()}
                centered
                className="w-full"
            >
                Submit
            </Button>
            {message && (
                <p className="text-sm text-red-500 mt-2">Sorry, that username is taken!</p>
            )}
        </div>
    )
}

export default function UsernamePage() {
    return (
        <Suspense fallback={<LoadingScreen />}>
            <UsernameForm />
        </Suspense>
    )
}
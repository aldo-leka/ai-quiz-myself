"use client"

import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {useEffect, useState} from "react";
import {socket} from "@/socket";
import {useGame} from "@/context/GameContext";

export default function NicknamePrompt() {
    const { setNickname } = useGame();
    const [inputValue, setInputValue] = useState("")
    const [message, setMessage] = useState("")

    useEffect(() => {
        const handleNicknameUnavailable = () => {
            setMessage("Nickname is already taken");
        };

        socket.on("nickname unavailable", handleNicknameUnavailable);

        return () => {
            socket.off("nickname unavailable", handleNicknameUnavailable);
        };
    }, []);

    const submit = () => {
        if (inputValue) {
            setNickname(inputValue);
        }
    }

    return (
        <div className="p-4 sm:p-6 md:p-8 min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="max-w-3xl w-full">
                <Label htmlFor="nickname" className="text-base font-medium">Choose a nickname</Label>
                <Input
                    id="nickname"
                    type="text"
                    placeholder="Santa Claus"
                    className="text-lg h-12 mb-6"
                    onChange={(e) => setInputValue(e.target.value)}
                />
                <p className="text-sm text-red-500 mb-2">{message}</p>
                <Button
                    type="submit"
                    className="mb-6 w-full py-6 text-lg font-medium"
                    onClick={submit}>
                    Enter
                </Button>
            </div>
        </div>
    )
}
"use client"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Turnstile } from '@marsidev/react-turnstile'
import {useState} from "react";
import {createClient} from "@/utils/supabase/client";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [isError, setIsError] = useState(false);

    async function signInWithEmail() {
        const supabase = createClient()
        const { data, error } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`
            }
        })

        if (error) {
            setMessage(error.message)
            setIsError(true)
        } else {
            setMessage("Please check your email for the login link.")
            setIsError(false)
        }
    }

    return (
        <div className="flex items-center justify-center h-screen">
            <Card className="w-[400px]">
                <CardHeader>
                    <CardTitle>Sign in / Sign up</CardTitle>
                    <CardDescription>
                        Sign in or sign up with a link straight to your inbox.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="space-y-1">
                        <Label htmlFor="email">Email</Label>
                        <Input 
                            id="email" 
                            placeholder="email@example.com" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""} />
                    {message && (
                        <p className={`mt-2 text-sm ${isError ? 'text-red-500' : 'text-gray-900'}`}>
                            {message}
                        </p>
                    )}
                </CardContent>
                <CardFooter>
                    <Button onClick={signInWithEmail}>Send Magic Link</Button>
                </CardFooter>
            </Card>
        </div>
    );
}
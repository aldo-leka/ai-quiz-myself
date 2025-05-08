"use client"

import {useEffect, useState} from "react"
import {User} from "@supabase/supabase-js"
import { createClient } from "@/utils/supabase/client"
import {useRouter} from "next/navigation";

export default function CreatePage() {
    const [user, setUser] = useState<User | null>(null)
    const router = useRouter();
    const supabase = createClient()

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user || null);
        }

        checkUser()
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    return (
        <>
            Create Game
            {user && (
                <button onClick={handleSignOut}>Sign out</button>
            )}
            {!user && (
                <button onClick={() => router.push('/login')}>Sign in</button>
            )}
        </>
    )
}
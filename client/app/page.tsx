"use client";

import { useEffect, useState } from "react";
import { socket } from "@/socket";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userCount, setUserCount] = useState(0);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoading(false);
      
      // Set up auth state change listener
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(session?.user || null);
        }
      );
      
      return () => {
        subscription.unsubscribe();
      };
    };
    
    checkUser();

    if (socket.connected) {
      onConnect();
    }

    function onConnect() {
      socket.emit('get user count');
    }

    function onDisconnect() {
    }

    function onUserCount(data: { count: number }) {
      setUserCount(data.count);
    }

    const pollInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('get user count');
      }
    }, 5000); // Poll every 5 seconds

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("user count", onUserCount);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("user count", onUserCount);
      clearInterval(pollInterval);
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-4">
      {user ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Welcome!</h1>
            <Button onClick={handleSignOut}>Sign Out</Button>
          </div>
          <p className="text-gray-600">Logged in as: {user.email}</p>
        </div>
      ) : (
        <div className="text-center">
          <p>You are not logged in.</p>
          <Button onClick={() => router.push('/login')} className="mt-4">
            Login
          </Button>
        </div>
      )}
      <div className="mt-6 p-4 border rounded-md">
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-center">
          <p className="text-blue-800 font-medium text-lg">👥 Users Online: {userCount}</p>
        </div>
        ENTER GAME STUFF HERE
      </div>
    </div>
  );
}

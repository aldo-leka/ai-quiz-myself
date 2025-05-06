"use client";

import { useEffect, useState } from "react";
import { socket } from "@/socket";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState("N/A");
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check user authentication status
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

    // Socket connection setup
    if (socket.connected) {
      onConnect();
    }

    function onConnect() {
      setIsConnected(true);
      setTransport(socket.io.engine.transport.name);

      socket.io.engine.on("upgrade", (transport) => {
        setTransport(transport.name);
      });
    }

    function onDisconnect() {
      setIsConnected(false);
      setTransport("N/A");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
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
          <div className="mt-6 p-4 border rounded-md">
            <p>Socket Status: {isConnected ? "connected" : "disconnected"}</p>
            <p>Transport: {transport}</p>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p>You are not logged in.</p>
          <Button onClick={() => router.push('/login')} className="mt-4">
            Go to Login
          </Button>
        </div>
      )}
    </div>
  );
}

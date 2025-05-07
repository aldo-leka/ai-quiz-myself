"use client";

import { useEffect, useState } from "react";
import { socket } from "@/socket";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { CountryStrips } from "@/components/CountryStrips";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlinePlayers, setOnlinePlayers] = useState<Record<string, number>>({});
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

      const detectUserCountry = async () => {
        try {
          // Using free IP geolocation API
          const response = await fetch('https://ipapi.co/json/');
          const data = await response.json();
          
          if (data && data.country_code) {
            socket.emit('set country', { country: data.country_code });
          }
        } catch (error) {
          console.error('Error detecting country:', error);
        }
      };

      detectUserCountry();
    }

    function onDisconnect() {
    }
    
    function onUserCounts(data: Record<string, number>) {
      console.log('onUserCounts', data);
      setOnlinePlayers(data);
    }

    const pollInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('get user count');
      }
    }, 5000); // Poll every 5 seconds

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("user counts", onUserCounts);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("user counts", onUserCounts);
      clearInterval(pollInterval);
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return <div className="loading-spinner" aria-label="Loading"></div>;
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <CountryStrips countryData={onlinePlayers} maxStrips={3} />
        </div>
        
        {user ? (
          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl sm:text-3xl font-bold">Welcome!</h1>
              <Button onClick={handleSignOut} className="px-6 py-2">Sign Out</Button>
            </div>
            <p className="text-gray-600">Logged in as: {user.email}</p>
          </div>
        ) : (
          <div className="text-center mb-8">
            <p className="text-lg mb-4">You are not logged in.</p>
            <Button onClick={() => router.push('/login')} className="px-8 py-2">
              Login
            </Button>
          </div>
        )}
        <div className="mt-6 p-6 sm:p-8 border rounded-lg shadow-sm bg-white max-w-lg mx-auto game-container">
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <p className="text-blue-800 font-medium text-xl">
              👥 {(() => {
                const totalPlayers = Object.values(onlinePlayers).reduce((sum, count) => sum + count, 0);
                return `${totalPlayers} ${totalPlayers === 1 ? 'Player' : 'Players'} Online`;
              })()}
            </p>
          </div>
          <div className="grid w-full items-center gap-2 mb-6">
            <Label htmlFor="gameCode" className="text-base font-medium">Game Code</Label>
            <Input id="gameCode" type="text" placeholder="ABCD" className="text-lg h-12" />
          </div>
          <div className="grid w-full items-center gap-2 mb-6">
            <Label htmlFor="nickname" className="text-base font-medium">Nickname</Label>
            <Input id="nickname" type="text" placeholder="Nicholas" className="text-lg h-12" />
          </div>
          <Button type="submit" className="mb-6 w-full py-6 text-lg font-medium">Join Game</Button>
          <Separator className="mb-6" />
          <Button type="submit" className="w-full py-6 text-lg font-medium" variant="outline">Create New Game</Button>
        </div>
      </div>
    </div>
  );
}

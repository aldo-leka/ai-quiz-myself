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

export default function SignInPage() {
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
                        <Input id="email" placeholder="email@example.com" />
                    </div>
                    <Turnstile siteKey={process.env.TURNSTILE_SITE_KEY || ""} />
                </CardContent>
                <CardFooter>
                    <Button>Send Magic Link</Button>
                </CardFooter>
            </Card>
        </div>
    );
}
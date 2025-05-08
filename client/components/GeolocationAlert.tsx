import {Terminal} from "lucide-react";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";

export default function GeolocationAlert() {
    return <Alert>
        <Terminal className="h-4 w-4" />
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>
            In order to show where you are from, we need to access your location.
        </AlertDescription>
    </Alert>
}